import _ from 'underscore';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { launchPuppeteer } from './puppeteer';
import { getApifyProxyUrl } from './actor';

const DEFAULT_PUPPETEER_CONFIG = {
    dumpio: process.env.NODE_ENV !== 'production',
    slowMo: 0,
    args: [],
};

// @TODO log console messages and errors

const DEFAULT_OPTIONS = {
    maxOpenPagesPerInstance: 1000,
    abortInstanceAfterRequestCount: 50,

    // These can't be constants because we need it for unit tests.
    instanceKillerIntervalMillis: 60 * 1000,
    killInstanceAfterMillis: 5 * 60 * 1000,

    launchPuppeteerFunction: ({ proxyGroups, puppeteerConfig, disableProxy }) => {
        checkParamOrThrow(proxyGroups, 'opts.proxyGroups', 'Maybe Array');
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

        // @TODO: Maybe we should move this whole logic directly to Apify.launchPuppeteer().
        // E.g. if process.env.APIFY_PROXY_HOST is defined, then puppeteer should use it with "auto".
        if (!disableProxy) {
            const session = Math.random();

            config.proxyUrl = getApifyProxyUrl({ proxyGroups, session });
        }

        return launchPuppeteer(config);
    },
};

class PuppeteerInstance {
    constructor(id, browserPromise) {
        this.id = id;
        this.activePages = 0;
        this.totalPages = 0;
        this.browserPromise = browserPromise;
        this.lastPageOpenedAt = Date.now();
    }
}

export default class PuppeteerPool {
    constructor(opts = {}) {
        checkParamOrThrow(opts, 'opts', 'Object');

        const {
            maxOpenPagesPerInstance,
            abortInstanceAfterRequestCount, // @TODO defaults
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

    _retireInstance(instance) {
        const { id } = instance;

        if (!this.activeInstances[id]) return log.warning('PuppeteerPool: browser is retired already', { id });

        log.info('PuppeteerPool: retiring browser', { id });

        this.retiredInstances[id] = instance;
        delete this.activeInstances[id];
    }

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

    _killInstance(instance) {
        const { id } = instance;

        log.info('PuppeteerPool: killing browser', { id });

        delete this.retiredInstances[id];

        instance
            .browserPromise
            .then(browser => browser.close())
            .catch(err => log.exception(err, 'PuppeteerPool: cannot close the browser instance', { id }));
    }

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
            .catch((err) => {
                log.exception(err, 'PuppeteerPool: browser.newPage() failed', { id: instance.id });
                this._retireInstance(instance);
                throw err;
            });
    }

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
