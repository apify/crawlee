import ow from 'ow';
import * as _ from 'underscore';
import { BrowserPool } from 'browser-pool'; // eslint-disable-line import/no-duplicates
import { BASIC_CRAWLER_TIMEOUT_MULTIPLIER } from '../constants';
import { gotoExtended } from '../puppeteer_utils';
import { SessionPool } from '../session_pool/session_pool'; // eslint-disable-line import/no-duplicates
import { addTimeoutToPromise } from '../utils';
import BasicCrawler from './basic_crawler'; // eslint-disable-line import/no-duplicates
import { validators } from '../validators';
import defaultLog from '../utils_log';
import {
    getSessionIdFromProxyUrl,
    throwOnBlockedRequest,
} from './crawler_utils';

// eslint-enable-line import/no-duplicates

class BrowserCrawler {
    constructor(options) {
        this._validateOptions(options);

        const {
            handlePageFunction,
            handlePageTimeoutSecs = 60,
            gotoTimeoutSecs = 60,
            persistCookiesPerSession = true,
            proxyConfiguration,
            browserPoolOptions,
            preNavigationHooks = [],
            postNavigationHooks = [],
        } = options;

        this.log = defaultLog.child({ prefix: 'BrowserCrawler' });
        this.handlePageFunction = handlePageFunction;

        this.handlePageTimeoutSecs = handlePageTimeoutSecs;
        this.handlePageTimeoutMillis = this.handlePageTimeoutSecs * 1000;
        this.gotoTimeoutMillis = gotoTimeoutSecs * 1000;

        this.persistCookiesPerSession = persistCookiesPerSession;
        this.proxyConfiguration = proxyConfiguration;

        this.preNavigationHooks = preNavigationHooks;
        this.postNavigationHooks = postNavigationHooks;

        this.basicCrawler = this._createBasicCrawler(options);
        this.sessionPool = this._maybeCreateSessionPool(options);

        this.browserPool = new BrowserPool({
            ...browserPoolOptions,
            browserPlugins: browserPoolOptions.browserPlugins.map((plugin) => {
                if (!plugin.createProxyUrlFunction && this.proxyConfiguration) {
                    plugin.createProxyUrlFunction = this._createProxyUrlFunction.bind(this);
                }
                return plugin;
            }),
        });
    }

    _createBasicCrawler(options) {
        const {
            maxConcurrency,
            minConcurrency,
            // BasicCrawler options
            requestList,
            requestQueue,
            maxRequestRetries,
            maxRequestsPerCrawl,
            handleFailedRequestFunction = this._defaultHandleFailedRequestFunction.bind(this),
            autoscaledPoolOptions,
        } = options;
        /** @ignore */
        return new BasicCrawler({
            // Basic crawler options.
            requestList,
            requestQueue,
            maxRequestRetries,
            maxRequestsPerCrawl,
            handleRequestFunction: (...args) => this._handleRequestFunction(...args),
            handleRequestTimeoutSecs: this.handlePageTimeoutSecs * BASIC_CRAWLER_TIMEOUT_MULTIPLIER,
            handleFailedRequestFunction,

            // Autoscaled pool options.
            maxConcurrency,
            minConcurrency,
            autoscaledPoolOptions,

            // log
            log: this.log,
        });
    }

    _maybeCreateSessionPool(options) {
        const {
            useSessionPool = true,
            sessionPoolOptions = {},
        } = options;

        if (useSessionPool || this.persistCookiesPerSession) {
            return new SessionPool({
                ...sessionPoolOptions,
                log: this.log,
            });
        }
    }

    async run() {
        if (this.isRunningPromise) return this.isRunningPromise;

        this._maybeAddSessionPoolToBrowserPool();
        this.maybeAddProxyConfigurationToBrowserPool();

        if (this.sessionPool) {
            await this.sessionPool.initialize();
        }

        try {
            this.isRunningPromise = this.basicCrawler.run();
            this.autoscaledPool = this.basicCrawler.autoscaledPool;

            await this.isRunningPromise;
        } finally {
            if (this.sessionPool) {
                await this.sessionPool.teardown();
            }
            await this.browserPool.destroy();
        }
    }

    _maybeAddSessionPoolToBrowserPool() {
        if (this.sessionPool) {
            // @TODO: proper session retirement
            this.browserPool.postLaunchHooks.push(this._sessionPoolPostLaunchHook.bind(this));
        }
    }

    async _sessionPoolPostLaunchHook(browserController) {
        const { proxyUrl } = browserController;

        if (proxyUrl) {
            const sessionIdFromUrl = getSessionIdFromProxyUrl(proxyUrl);
            browserController.userData.session = this.sessionPool.sessions.find(({ id }) => id === sessionIdFromUrl);
        }

        browserController.userData.session = await this.sessionPool.getSession();
    }

    maybeAddProxyConfigurationToBrowserPool() {
        if (this.proxyConfiguration) {
            this.browserPool.postLaunchHooks.push(this._proxyConfigurationHook.bind(this));
        }
    }

    async _proxyConfigurationHook(browserController) {
        const { session } = browserController.userData;
        browserController.userData.proxyInfo = await this.proxyConfiguration.newProxyInfo(session && session.id);
    }

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @param {Object} crawlingContext
     * @param {Request} crawlingContext.request
     * @param {AutoscaledPool} crawlingContext.autoscaledPool
     * @param {Session} [crawlingContext.session]
     * @ignore
     */
    async _handleRequestFunction(crawlingContext) {
        const page = await this.browserPool.newPage();
        this._enhanceCrawlingContextWithPageInfo(crawlingContext, page);

        const { request, session } = crawlingContext;

        if (this.persistCookiesPerSession) {
            await page.setCookie(...crawlingContext.session.getPuppeteerCookies(request.url));
        }

        try {
            await this._handleNavigation(crawlingContext);
            await this._handleResponse(crawlingContext);

            // save cookies
            if (this.persistCookiesPerSession) {
                const cookies = await page.cookies(request.loadedUrl);
                session.setPuppeteerCookies(cookies, request.loadedUrl);
            }

            await addTimeoutToPromise(
                this.handlePageFunction(crawlingContext),
                this.handlePageTimeoutMillis,
                `handlePageFunction timed out after ${this.handlePageTimeoutMillis / 1000} seconds.`,
            );

            if (session) session.markGood();
        } finally {
            try {
                await page.close();
            } catch (error) {
                // Only log error in page close.
                this.log.debug('Error while closing page', { error });
            }
        }
    }

    _enhanceCrawlingContextWithPageInfo(crawlingContext, page) {
        crawlingContext.page = page;

        const browserControllerInstance = this.browserPool.getBrowserControllerByPage(page);
        crawlingContext.browserController = browserControllerInstance;

        if (this.sessionPool) {
            crawlingContext.session = browserControllerInstance.userData.session;
        }

        if (this.proxyConfiguration) {
            crawlingContext.proxyInfo = browserControllerInstance.userData.proxyInfo;
        }

        crawlingContext.crawler = this;
    }

    async _handleNavigation(crawlingContext) {
        try {
            await this._executeHooks(this.preNavigationHooks, crawlingContext);
            crawlingContext.response = await this.gotoFunction(crawlingContext);
        } catch (err) {
            crawlingContext.error = err;

            return this._executeHooks(this.postNavigationHooks, crawlingContext);
        }

        await this._executeHooks(this.postNavigationHooks, crawlingContext);
    }

    /**
     * Should be overriden in case of different automation library that does not support this response API.
     * // @TODO: This can be also don as a postNavigation hook except the loadedUrl marking.
     * @param crawlingContext
     * @return {Promise<void>}
     * @private
     */
    async _handleResponse(crawlingContext) {
        const { response, session, request, page } = crawlingContext;

        if (this.sessionPool && response) {
            if (typeof response === 'object' && typeof response.status === 'function') {
                throwOnBlockedRequest(session, response.status());
            } else {
                this.log.debug('Got a malformed Browser response.', { request, response });
            }
        }

        request.loadedUrl = await page.url();
    }

    /**
     * @param {Object} options
     * @param {PuppeteerPage} options.page
     * @param {Request} options.request
     * @property {AutoscaledPool} autoscaledPool
     * @property {PuppeteerPool} puppeteerPool
     * @property {Session} [session]
     * @property {ProxyInfo} [proxyInfo]
     * @return {Promise<PuppeteerResponse>}
     * @ignore
     */
    async gotoFunction({ page, request }) {
        return gotoExtended(page, request, { timeout: this.gotoTimeoutMillis });
    }

    /**
     * @param {Object} options
     * @param {Error} options.error
     * @param {Request} options.request
     * @return {Promise<void>}
     * @ignore
     */
    async _defaultHandleFailedRequestFunction({ error, request }) { // eslint-disable-line class-methods-use-this
        const details = _.pick(request, 'id', 'url', 'method', 'uniqueKey');
        this.log.exception(error, 'Request failed and reached maximum retries', details);
    }

    async _createProxyUrlFunction() {
        let session;

        if (this.sessionPool) {
            session = await this.sessionPool.getSession();
        }

        return this.proxyConfiguration.newUrl(session && session.id);
    }

    // @TODO: create a validator to have a one line validation.
    _validateOptions(options) {
        ow(options, ow.object.exactShape({
            handlePageFunction: ow.function,
            gotoFunction: ow.optional.function,
            handlePageTimeoutSecs: ow.optional.number,
            gotoTimeoutSecs: ow.optional.number,

            // AutoscaledPool shorthands
            maxConcurrency: ow.optional.number,
            minConcurrency: ow.optional.number,

            // BasicCrawler options
            requestList: ow.optional.object.validate(validators.requestList),
            requestQueue: ow.optional.object.validate(validators.requestQueue),
            maxRequestRetries: ow.optional.number,
            maxRequestsPerCrawl: ow.optional.number,
            handleFailedRequestFunction: ow.optional.function,
            autoscaledPoolOptions: ow.optional.object,

            browserPoolOptions: ow.object,
            sessionPoolOptions: ow.optional.object,
            persistCookiesPerSession: ow.optional.boolean,
            useSessionPool: ow.optional.boolean,
            proxyConfiguration: ow.optional.object.validate(validators.proxyConfiguration),
        }));
    }

    async _executeHooks(hooks, ...args) {
        if (Array.isArray(hooks) && hooks.length) {
            for (const hook of hooks) {
                await hook(...args);
            }
        }
    }
}

export default BrowserCrawler;
