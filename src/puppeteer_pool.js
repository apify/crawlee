import _ from 'underscore';
import log from 'apify-shared/log';
import Promise from 'bluebird';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { launchPuppeteer } from './puppeteer';

const PROCESS_KILL_TIMEOUT_MILLIS = 5000;

const DEFAULT_OPTIONS = {
    // Don't make these too large, otherwise Puppeteer might start crashing weirdly,
    // and the default settings should just work
    maxOpenPagesPerInstance: 50,
    retireInstanceAfterRequestCount: 100,

    // These can't be constants because we need it for unit tests.
    instanceKillerIntervalMillis: 60 * 1000,
    killInstanceAfterMillis: 5 * 60 * 1000,

    // TODO: use settingsRotator()
    launchPuppeteerFunction: launchPuppeteerOptions => launchPuppeteer(launchPuppeteerOptions),
};

/**
 * Internal representation of Puppeteer instance.
 *
 * @ignore
 */
class PuppeteerInstance {
    constructor(id, browserPromise) {
        this.id = id;
        this.activePages = 0;
        this.totalPages = 0;
        this.browserPromise = browserPromise;
        this.lastPageOpenedAt = Date.now();
        this.killed = false;
        this.childProcess = null;
    }
}

/**
 * Manages a pool of Chrome browser instances controlled by [Puppeteer](https://github.com/GoogleChrome/puppeteer).
 * `PuppeteerPool` rotates Chrome instances to change proxies
 * and other settings, in order to prevent detection of your web scraping bot,
 * access web pages from various countries etc.
 *
 * Example usage:
 *
 * ```javascript
 * const puppeteerPool = new PuppeteerPool({
 *   launchPuppeteerFunction: () => {
 *     // Use a new proxy with a new IP address for each new Chrome instance
 *     return Apify.launchPuppeteer({
 *        apifyProxySession: Math.random(),
 *     });
 *   },
 * });
 *
 * const page1 = await puppeteerPool.newPage();
 * const page2 = await puppeteerPool.newPage();
 * const page3 = await puppeteerPool.newPage();
 *
 * // ... do something with pages ...
 *
 * // Close all browsers.
 * await puppeteerPool.destroy();
 * ```
 *
 * @param {Number} [options.maxOpenPagesPerInstance=50]
 *   Maximum number of open pages (i.e. tabs) per browser. When this limit is reached, new pages are loaded in a new browser instance.
 * @param {Number} [options.retireInstanceAfterRequestCount=100]
 *   Maximum number of requests that can be processed by a single browser instance.
 *   After the limit is reached, the browser is retired and new requests are
 *   be handled by a new browser instance.
 * @param {Number} [options.instanceKillerIntervalMillis=60000]
 *   Indicates how often opened Puppeteer instances are checked whether they can be closed.
 * @param {Number} [options.killInstanceAfterMillis=300000]
 *   When Puppeteer instance reaches the `options.retireInstanceAfterRequestCount` limit then
 *   it is considered retired and no more tabs will be opened. After the last tab is closed the
 *   whole browser is closed too. This parameter defines a time limit for inactivity after
 *   which the browser is closed even if there are pending open tabs.
 * @param {Function} [options.launchPuppeteerFunction=launchPuppeteerOptions&nbsp;=>&nbsp;Apify.launchPuppeteer(launchPuppeteerOptions)]
 *   Overrides the default function to launch a new `Puppeteer` instance.
 * @param {LaunchPuppeteerOptions} [options.launchPuppeteerOptions]
 *   Options used by `Apify.launchPuppeteer()` to start new Puppeteer instances.
 */
export default class PuppeteerPool {
    constructor(opts = {}) {
        checkParamOrThrow(opts, 'opts', 'Object');

        // For backwards compatibility, in the future we can remove this...
        if (!opts.retireInstanceAfterRequestCount && opts.abortInstanceAfterRequestCount) {
            log.warning('PuppeteerPool: Parameter `abortInstanceAfterRequestCount` is deprecated! Use `retireInstanceAfterRequestCount` instead!');
            opts.retireInstanceAfterRequestCount = opts.abortInstanceAfterRequestCount;
        }

        const {
            maxOpenPagesPerInstance,
            retireInstanceAfterRequestCount,
            launchPuppeteerFunction,
            instanceKillerIntervalMillis,
            killInstanceAfterMillis,
            launchPuppeteerOptions,
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(maxOpenPagesPerInstance, 'opts.maxOpenPagesPerInstance', 'Number');
        checkParamOrThrow(retireInstanceAfterRequestCount, 'opts.retireInstanceAfterRequestCount', 'Number');
        checkParamOrThrow(launchPuppeteerFunction, 'opts.launchPuppeteerFunction', 'Function');
        checkParamOrThrow(instanceKillerIntervalMillis, 'opts.instanceKillerIntervalMillis', 'Number');
        checkParamOrThrow(killInstanceAfterMillis, 'opts.killInstanceAfterMillis', 'Number');
        checkParamOrThrow(launchPuppeteerOptions, 'opts.launchPuppeteerOptions', 'Maybe Object');

        // Config.
        this.maxOpenPagesPerInstance = maxOpenPagesPerInstance;
        this.retireInstanceAfterRequestCount = retireInstanceAfterRequestCount;
        this.killInstanceAfterMillis = killInstanceAfterMillis;
        this.launchPuppeteerFunction = () => launchPuppeteerFunction(launchPuppeteerOptions);

        // State.
        this.browserCounter = 0;
        this.activeInstances = {};
        this.retiredInstances = {};
        this.instanceKillerInterval = setInterval(() => this._killRetiredInstances(), instanceKillerIntervalMillis);
    }

    /**
     * Launches new browser instance.
     *
     * @ignore
     */
    _launchInstance() {
        const id = this.browserCounter++;
        const browserPromise = this.launchPuppeteerFunction();
        const instance = new PuppeteerInstance(id, browserPromise);

        instance
            .browserPromise
            .then((browser) => {
                browser.on('disconnected', () => {
                    // If instance.killed === true then we killed the instance so don't log it.
                    if (!instance.killed) log.error('PuppeteerPool: Puppeteer sent "disconnect" event. Crashed???', { id });
                    this._retireInstance(instance);
                });
                // This one is done manually in Puppeteerpool.newPage() to happen immediately.
                // browser.on('targetcreated', () => instance.activePages++);
                browser.on('targetdestroyed', () => {
                    instance.activePages--;

                    if (instance.activePages === 0 && this.retiredInstances[id]) this._killInstance(instance);
                });

                instance.childProcess = browser.process();
            })
            .catch((err) => {
                log.exception(err, 'PuppeteerPool: Browser start failed', { id });

                return this._retireInstance(instance);
            });

        this.activeInstances[id] = instance;

        return instance;
    }

    /**
     * Retires some of the instances for example due to to many uses.
     *
     * @ignore
     */
    _retireInstance(instance) {
        const { id } = instance;

        if (!this.activeInstances[id]) return log.warning('PuppeteerPool: browser is retired already', { id });

        log.debug('PuppeteerPool: retiring browser', { id });

        this.retiredInstances[id] = instance;
        delete this.activeInstances[id];
    }

    /**
     * Kills all the retired instances that:
     * - have all tabs closed
     * - or are inactive for more then killInstanceAfterMillis.
     *
     * @ignore
     */
    _killRetiredInstances() {
        log.debug('PuppeteerPool: retired browsers count', { count: _.values(this.retiredInstances).length });

        _.mapObject(this.retiredInstances, (instance) => {
            // Kill instances that are more than this.killInstanceAfterMillis from last opened page
            if (Date.now() - instance.lastPageOpenedAt > this.killInstanceAfterMillis) this._killInstance(instance);

            instance
                .browserPromise
                .then(browser => browser.pages())
                .then((pages) => {
                    if (pages.length === 0) this._killInstance(instance);
                }, (err) => {
                    log.exception(err, 'PuppeteerPool: browser.pages() failed', { id: instance.id });
                    this._killInstance(instance);
                });
        });
    }

    /**
     * Kills given browser instance.
     *
     * @ignore
     */
    _killInstance(instance) {
        const { id, childProcess } = instance;

        log.debug('PuppeteerPool: killing browser', { id });

        delete this.retiredInstances[id];

        // Ensure that Chrome process will be really killed.
        setTimeout(() => {
            // This is here because users reported that it happened
            // that error `TypeError: Cannot read property 'kill' of null` was thrown.
            // Likely Chrome process wasn't started due to some error ...
            if (childProcess) childProcess.kill('SIGKILL');
        }, PROCESS_KILL_TIMEOUT_MILLIS);

        instance
            .browserPromise
            .then((browser) => {
                if (instance.killed) return;

                instance.killed = true;

                return browser.close();
            })
            .catch(err => log.exception(err, 'PuppeteerPool: cannot close the browser instance', { id }));
    }

    /**
     * Opens new tab in one of the browsers and returns promise that resolves to it's Puppeteer.Page.
     *
     * @return {Promise<Puppeteer.Page>}
     */
    newPage() {
        let instance;

        _.mapObject(this.activeInstances, (inst) => {
            if (inst.activePages >= this.maxOpenPagesPerInstance) return;

            instance = inst;
        });

        if (!instance) instance = this._launchInstance();

        instance.lastPageOpenedAt = Date.now();
        instance.totalPages++;
        instance.activePages++;

        if (instance.totalPages >= this.retireInstanceAfterRequestCount) this._retireInstance(instance);

        return instance.browserPromise
            .then(browser => browser.newPage())
            .then((page) => {
                page.on('error', (error) => {
                    log.exception(error, 'PuppeteerPool: page crashed');
                    page.close();
                });

                // TODO: log console messages page.on('console', message => log.debug(`Chrome console: ${message.text}`));

                return page;
            })
            .catch((err) => {
                log.exception(err, 'PuppeteerPool: browser.newPage() failed', { id: instance.id });
                this._retireInstance(instance);

                // !TODO: don't throw an error but repeat newPage with some delay
                throw err;
            });
    }

    /**
     * Closes all the browsers.
     */
    destroy() {
        clearInterval(this.instanceKillerInterval);

        const browserPromises = _
            .values(this.activeInstances)
            .concat(_.values(this.retiredInstances))
            .map((instance) => {
                // This is needed so that "Puppeteer disconnected" errors are not printed.
                instance.killed = true;

                return instance.browserPromise;
            });

        const closePromises = browserPromises.map((browserPromise) => {
            return browserPromise.then(browser => browser.close());
        });

        return Promise
            .all(closePromises)
            .catch(err => log.exception(err, 'PuppeteerPool: cannot close the browsers'));
    }
}
