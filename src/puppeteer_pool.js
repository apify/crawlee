import _ from 'underscore';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { launchPuppeteer } from './puppeteer';
import { getApifyProxyUrl } from './actor';
import { isProduction } from './utils';

const DEFAULT_PUPPETEER_CONFIG = {
    dumpio: !isProduction(),
    slowMo: 0,
    args: [],
};

const DEFAULT_OPTIONS = {
    maxOpenPagesPerInstance: 100,
    abortInstanceAfterRequestCount: 150,

    // These can't be constants because we need it for unit tests.
    instanceKillerIntervalMillis: 60 * 1000,
    killInstanceAfterMillis: 5 * 60 * 1000,

    // TODO: use settingsRotator()
    launchPuppeteerFunction: ({ groups, puppeteerConfig, disableProxy = false }) => {
        checkParamOrThrow(groups, 'opts.groups', 'Maybe Array');
        checkParamOrThrow(puppeteerConfig, 'opts.puppeteerConfig', 'Maybe Object');
        checkParamOrThrow(disableProxy, 'opts.disableProxy', 'Maybe Boolean');

        const config = Object.assign({}, DEFAULT_PUPPETEER_CONFIG, puppeteerConfig);

        // TODO: is this needed at all? It might be confusing because the feature has the same name
        // as Chrome command line flag, so people will assume it's doing just that.
        // For simplicity I'd just remove it...
        if (config.disableWebSecurity) {
            config.ignoreHTTPSErrors = true;
            config.args.push('--disable-web-security');
        }

        // TODO: Maybe we should move this whole logic directly to Apify.launchPuppeteer().
        // E.g. if process.env.APIFY_PROXY_HOST is defined, then puppeteer should use it with "auto".
        if (!disableProxy) {
            const session = Math.random();

            config.proxyUrl = getApifyProxyUrl({ groups, session });
        }

        return launchPuppeteer(config);
    },
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
    }
}

/**
 * PuppeteerPool class provides a pool of Puppeteer (Chrome browser) instances.
 * It rotates them based on it's configuration to change proxies.
 *
 * Example use:
 *
 * ```javascript
 * const puppeteerPool = new PuppeteerPool({ groups: 'some-proxy-group' });
 *
 * const page1 = await puppeteerPool.newPage();
 * const page2 = await puppeteerPool.newPage();
 * const page3 = await puppeteerPool.newPage();
 *
 * // ... do something with pages ...
 *
 * // Close all the browsers.
 * await puppeteerPool.destroy();
 * ```
 *
 * @param {Number} [options.maxOpenPagesPerInstance=100] Maximal number of opened tabs per browser. If limit is reached then the new
 *                                                        browser gets started. (See `maxOpenPagesPerInstance` parameter of `Apify.PuppeteerPool`)
 * @param {Number} [options.abortInstanceAfterRequestCount=150] Maximal number of requests proceeded from one browser. After that browser
 *                                                              gets restarted. (See `abortInstanceAfterRequestCount` parameter of
 *                                                              `Apify.PuppeteerPool`)
 * @param {Function} [options.launchPuppeteerFunction] Overrides how new Puppeteer instance gets launched. (See `launchPuppeteerFunction` parameter of
 *                                                     `Apify.PuppeteerPool`)
 * @param {Number} [options.instanceKillerIntervalMillis=60000] How often opened Puppeteer instances get checked if some of then might be
 *                                                              closed. (See `instanceKillerIntervalMillis` parameter of `Apify.PuppeteerPool`)
 * @param {Number} [options.killInstanceAfterMillis=300000] If Puppeteer instance reaches the limit options.abortInstanceAfterRequestCount then it's
 *                                                          considered retired and no more tabs will be opened. After the last tab get's closed the
 *                                                          whole browser gets closed. This defines limit of inactivity after the browser gets closed
 *                                                          even if there are pending tabs. (See `killInstanceAfterMillis` parameter of
 *                                                          `Apify.PuppeteerPool`)
 * @param {Object} [options.puppeteerConfig={ dumpio: process.env.NODE_ENV !== 'production', slowMo: 0, args: []}] Configuration of Puppeteer
 *                                                          instances. (See `puppeteerConfig` parameter of `Apify.PuppeteerPool`)
 * @param {Boolean} [options.disableProxy=false] Disables proxying thru Apify proxy. (See `disableProxy` parameter of `Apify.PuppeteerPool`)
 * @param {Array} [options.groups] Apify proxy groups to be used. (See `Apify.getApifyProxyUrl()` for more)
 */
export default class PuppeteerPool {
    constructor(opts = {}) {
        checkParamOrThrow(opts, 'opts', 'Object');

        const {
            maxOpenPagesPerInstance,
            abortInstanceAfterRequestCount,
            launchPuppeteerFunction,
            instanceKillerIntervalMillis,
            killInstanceAfterMillis,
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(maxOpenPagesPerInstance, 'opts.maxOpenPagesPerInstance', 'Number');
        checkParamOrThrow(abortInstanceAfterRequestCount, 'opts.abortInstanceAfterRequestCount', 'Number');
        checkParamOrThrow(launchPuppeteerFunction, 'opts.launchPuppeteerFunction', 'Function');
        checkParamOrThrow(instanceKillerIntervalMillis, 'opts.instanceKillerIntervalMillis', 'Number');
        checkParamOrThrow(killInstanceAfterMillis, 'opts.killInstanceAfterMillis', 'Number');

        // Config.
        this.maxOpenPagesPerInstance = maxOpenPagesPerInstance;
        this.abortInstanceAfterRequestCount = abortInstanceAfterRequestCount;
        this.killInstanceAfterMillis = killInstanceAfterMillis;
        this.launchPuppeteerFunction = () => launchPuppeteerFunction(opts);

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
                    log.error('PuppeteerPool: Puppeteer sent "disconnect" event. Crashed???', { id });
                    this._retireInstance(instance);
                });
                // This one is done manually in Puppeteerpool.newPage() to happen immediately.
                // browser.on('targetcreated', () => instance.activePages++);
                browser.on('targetdestroyed', () => {
                    instance.activePages--;

                    if (instance.activePages === 0 && this.retiredInstances[id]) this._killInstance(instance);
                });
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

        log.info('PuppeteerPool: retiring browser', { id });

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
        log.info('PuppeteerPool: retired browsers count', { count: _.values(this.retiredInstances).length });

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
        const { id } = instance;

        log.info('PuppeteerPool: killing browser', { id });

        delete this.retiredInstances[id];

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

        if (instance.totalPages >= this.abortInstanceAfterRequestCount) this._retireInstance(instance);

        return instance.browserPromise
            .then(browser => browser.newPage())
            .then((page) => {
                page.on('error', (error) => {
                    log.exception(error, 'PuppeteerPool: page crashled');
                    page.close();
                });

                // TODO: log console messages page.on('console', message => log.debug(`Chrome console: ${message.text}`));

                return page;
            })
            .catch((err) => {
                log.exception(err, 'PuppeteerPool: browser.newPage() failed', { id: instance.id });
                this._retireInstance(instance);
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
            .map(instance => instance.browserPromise);

        const closePromises = browserPromises.map((browserPromise) => {
            return browserPromise.then(browser => browser.close());
        });

        return Promise
            .all(closePromises)
            .catch(err => log.exception(err, 'PuppeteerPool: cannot close the browsers'));
    }
}
