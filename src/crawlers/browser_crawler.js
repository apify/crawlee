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
    handleRequestTimeout,
    getSessionIdFromProxyUrl,
    throwOnBlockedRequest,
} from './crawler_utils';

// eslint-enable-line import/no-duplicates

class BrowserCrawler {
    constructor(options) {
        this._validateOptions(options);

        const {
            handlePageFunction,
            gotoFunction = this._defaultGotoFunction,
            handlePageTimeoutSecs = 60,
            gotoTimeoutSecs = 60,
            persistCookiesPerSession = false,
            proxyConfiguration,
            browserPlugins = [],
            maxOpenPagesPerBrowser,
            retireBrowserAfterPageCount,
            operationTimeoutSecs,
            killBrowserAfterSecs,
            browserKillerIntervalSecs,
            preLaunchHooks,
            postLaunchHooks,
            prePageCreateHooks,
            postPageCreateHooks,
            prePageCloseHooks,
            postPageCloseHooks,
        } = options;
        this.log = defaultLog.child({ prefix: 'PuppeteerCrawler' });
        this.handlePageFunction = handlePageFunction;
        this.gotoFunction = gotoFunction;

        this.handlePageTimeoutSecs = handlePageTimeoutSecs;
        this.handlePageTimeoutMillis = this.handlePageTimeoutSecs * 1000;
        this.gotoTimeoutMillis = gotoTimeoutSecs * 1000;

        this.persistCookiesPerSession = persistCookiesPerSession;
        this.proxyConfiguration = proxyConfiguration;

        // BrowserPool options
        this.browserPlugins = browserPlugins;
        this.maxOpenPagesPerBrowser = maxOpenPagesPerBrowser;
        this.retireBrowserAfterPageCount = retireBrowserAfterPageCount;
        this.operationTimeoutSecs = operationTimeoutSecs;
        this.killBrowserAfterSecs = killBrowserAfterSecs;
        this.browserKillerIntervalSecs = browserKillerIntervalSecs;
        // BrowserPool hooks
        this.preLaunchHooks = preLaunchHooks;
        this.postLaunchHooks = postLaunchHooks;
        this.prePageCreateHooks = prePageCreateHooks;
        this.postPageCreateHooks = postPageCreateHooks;
        this.prePageCloseHooks = prePageCloseHooks;
        this.postPageCloseHooks = postPageCloseHooks;

        this.basicCrawler = this._createBasicCrawler(options);
        this.sessionPool = this._maybeCreateSessionPool(options);

        this.browserPool = null;
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
            useSessionPool = false,
            sessionPoolOptions = {},
        } = options;

        if (!useSessionPool) {
            return;
        }

        return new SessionPool({
            ...sessionPoolOptions,
            log: this.log,
        });
    }

    async run() {
        if (this.isRunningPromise) return this.isRunningPromise;

        this.createBrowserPool();

        this._maybeAddSessionPoolToBrowserPool();
        this._maybeAddPoxyConfigurationToBrowserPool();

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

    createBrowserPool() {
        this.browserPool = new BrowserPool({
            browserPlugins: this.browserPlugins.map((plugin) => {
                if (!plugin.createProxyUrlFunction) {
                    plugin.createProxyUrlFunction = this._createProxyUrlFunction.bind(this);
                }
                return plugin;
            }),
            maxOpenPagesPerBrowser: this.maxOpenPagesPerBrowser,
            retireBrowserAfterPageCount: this.retireBrowserAfterPageCount,
            operationTimeoutSecs: this.operationTimeoutSecs,
            killBrowserAfterSecs: this.killBrowserAfterSecs,
            browserKillerIntervalSecs: this.browserKillerIntervalSecs,
            preLaunchHooks: this.preLaunchHooks,
            postLaunchHooks: this.postLaunchHooks,
            prePageCreateHooks: this.prePageCreateHooks,
            postPageCreateHooks: this.postPageCreateHooks,
            prePageCloseHooks: this.prePageCloseHooks,
            postPageCloseHooks: this.postPageCloseHooks,
        });

        return this.browserPool;
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

    _maybeAddPoxyConfigurationToBrowserPool() {
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
            const response = await this._handleNavigation(crawlingContext);

            request.loadedUrl = await page.url();

            // save cookies
            if (this.persistCookiesPerSession) {
                const cookies = await page.cookies(request.loadedUrl);
                session.setPuppeteerCookies(cookies, request.loadedUrl);
            }
            crawlingContext.response = response;

            await addTimeoutToPromise(
                this.handlePageFunction(crawlingContext),
                this.handlePageTimeoutMillis,
                `handlePageFunction timed out after ${this.handlePageTimeoutMillis / 1000} seconds.`,
            );

            if (session) session.markGood();
        } finally {
            try {
                await page.close();
            } catch (e) {
                // Ignoring error in page close.
            }
        }
    }

    _enhanceCrawlingContextWithPageInfo(crawlingContext, page) {
        crawlingContext.page = page;
        // eslint-disable-next-line no-underscore-dangle
        const browserControllerInstance = this.browserPool.getBrowserControllerByPage(page);
        crawlingContext.browserController = browserControllerInstance;
        crawlingContext.browserPool = this.browserPool;

        if (this.sessionPool) {
            crawlingContext.session = browserControllerInstance.userData.session;
        }

        if (this.proxyConfiguration) {
            crawlingContext.proxyInfo = browserControllerInstance.userData.proxyInfo;
        }
    }

    async _handleNavigation(crawlingContext) {
        const { request, session } = crawlingContext;
        let response;

        try {
            response = await this.gotoFunction(crawlingContext);
        } catch (err) {
            // It would be better to compare the instances,
            // but we don't have access to puppeteer.errors here.
            if (err.constructor.name === 'TimeoutError') {
                handleRequestTimeout(session, err.message);
            }
        }

        if (this.sessionPool && response) {
            if (typeof response === 'object' && typeof response.status === 'function') {
                throwOnBlockedRequest(session, response.status());
            } else {
                this.log.debug('Got a malformed Puppeteer response.', { request, response });
            }
        }

        return response;
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
    async _defaultGotoFunction({ page, request }) {
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
            browserPlugins: ow.array.minLength(1),
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

            // BrowserPool options and shorthands
            maxOpenPagesPerBrowser: ow.optional.number,
            retireBrowserAfterPageCount: ow.optional.number,
            operationTimeoutSecs: ow.optional.number,
            killBrowserAfterSecs: ow.optional.number,
            browserKillerIntervalSecs: ow.optional.number,
            preLaunchHooks: ow.optional.array,
            postLaunchHooks: ow.optional.array,
            prePageCreateHooks: ow.optional.array,
            postPageCreateHooks: ow.optional.array,
            prePageCloseHooks: ow.optional.array,
            postPageCloseHooks: ow.optional.array,

            sessionPoolOptions: ow.optional.object,
            persistCookiesPerSession: ow.optional.boolean,
            useSessionPool: ow.optional.boolean,
            proxyConfiguration: ow.optional.object.validate(validators.proxyConfiguration),
        }));
    }
}

export default BrowserCrawler;
