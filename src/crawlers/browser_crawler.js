import ow from 'ow';
import { URL } from 'url';
import * as _ from 'underscore';
import { BrowserPool, PuppeteerPlugin } from 'browser-pool'; // eslint-disable-line import/no-duplicates
import { BASIC_CRAWLER_TIMEOUT_MULTIPLIER } from '../constants';
import { gotoExtended } from '../puppeteer_utils';
import { SessionPool } from '../session_pool/session_pool'; // eslint-disable-line import/no-duplicates
import { addTimeoutToPromise } from '../utils';
import BasicCrawler from './basic_crawler'; // eslint-disable-line import/no-duplicates

import { validators } from '../validators';
import defaultLog from '../utils_log';
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
        } = options;
        this.log = defaultLog.child({ prefix: 'PuppeteerCrawler' });
        this.handlePageFunction = handlePageFunction;
        this.gotoFunction = gotoFunction;

        this.handlePageTimeoutSecs = handlePageTimeoutSecs;
        this.handlePageTimeoutMillis = this.handlePageTimeoutSecs * 1000;
        this.gotoTimeoutMillis = gotoTimeoutSecs * 1000;

        this.persistCookiesPerSession = persistCookiesPerSession;
        this.proxyConfiguration = proxyConfiguration;

        this.basicCrawler = this._createBasicCrawler(options);
        this.sessionPool = this._maybeCreateSessionPool(options);

        this.browserPool = this._createBrowserPool(options);
    }

    async run() {
        if (this.isRunningPromise) return this.isRunningPromise;

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

    /**
     * Handles timeout request
     * @param {Session} session
     * @param {string} errorMessage
     * @private
     */
    _handleRequestTimeout(session, errorMessage) {
        if (session) session.markBad();
        const timeoutMillis = errorMessage.match(/(\d+) ms/)[1]; // first capturing group
        const timeoutSecs = Number(timeoutMillis) / 1000;
        throw new Error(`gotoFunction timed out after ${timeoutSecs} seconds.`);
    }

    /**
     * Handles blocked request
     * @param {Session} session
     * @param {number} statusCode
     * @private
     */
    _throwOnBlockedRequest(session, statusCode) {
        const isBlocked = session.retireOnBlockedStatusCodes(statusCode);

        if (isBlocked) {
            throw new Error(`Request blocked - received ${statusCode} status code.`);
        }
    }

    _getSessionIdFromProxyUrl(proxyUrl) {
        const parsedUrl = new URL(proxyUrl);
        const { username } = parsedUrl.username;
        if (!username) {
            return;
        }
        const parts = username.split(',');
        const sessionPart = parts.find((part) => part.includes('session-'));

        return sessionPart && sessionPart.replace('session-', '');
    }

    async _createProxyUrlFunction() {
        let session;

        if (this.sessionPool) {
            session = await this.sessionPool.getSession();
        }

        return this.proxyConfiguration.newUrl(session && session.id);
    }

    _addSessionPoolToBrowserPool() {
        // @TODO: proper session retirement
        this.browserPool.postLaunchHooks.push(this._sessionPoolHook.bind(this));
    }

    async _sessionPoolHook(browserController) {
        const { proxyUrl } = browserController;

        if (proxyUrl) {
            const sessionIdFromUrl = this._getSessionIdFromProxyUrl(proxyUrl);
            browserController.userData.session = this.sessionPool.sessions.find(({ id }) => id === sessionIdFromUrl);
        }

        browserController.userData.session = await this.sessionPool.getSession();
    }

    _addProxyConfigurationToBrowserPool() {
        this.browserPool.postLaunchHooks.push(this._proxyConfigurationHook.bind(this));
    }

    async _proxyConfigurationHook(browserController) {
        const { session } = browserController.userData;
        browserController.userData.proxyInfo = await this.proxyConfiguration.newProxyInfo(session && session.id);
    }

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

            // BrowserPool options and shorthands
            maxOpenPagesPerBrowser: ow.optional.number,
            retireBrowserAfterPageCount: ow.optional.number,
            operationTimeoutSecs: ow.optional.number,
            killInstanceAfterSecs: ow.optional.number,
            instanceKillerIntervalSecs: ow.optional.number,
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

    _createBrowserPool(options) {
        const {
            browserPlugins = [],
            maxOpenPagesPerBrowser,
            retireBrowserAfterPageCount,
            operationTimeoutSecs,
            killInstanceAfterSecs,
            instanceKillerIntervalSecs,
            preLaunchHooks,
            postLaunchHooks,
            prePageCreateHooks,
            postPageCreateHooks,
            prePageCloseHooks,
            postPageCloseHooks,
        } = options;
        let createProxyUrlFunction;

        if (this.proxyConfiguration) {
            createProxyUrlFunction = this._createProxyUrlFunction.bind(this);
        }

        const puppeteerPlugin = new PuppeteerPlugin(
            // eslint-disable-next-line
            require('puppeteer'), // @TODO:  allow custom library
            {
                createProxyUrlFunction: createProxyUrlFunction && createProxyUrlFunction.bind(this),
            },
        );

        this.browserPool = new BrowserPool({
            browserPlugins: [puppeteerPlugin],
            maxOpenPagesPerBrowser,
            retireBrowserAfterPageCount,
            operationTimeoutSecs,
            killInstanceAfterSecs,
            instanceKillerIntervalSecs,
            preLaunchHooks,
            postLaunchHooks,
            prePageCreateHooks,
            postPageCreateHooks,
            prePageCloseHooks,
            postPageCloseHooks,
        });

        if (this.sessionPool) {
            this._addSessionPoolToBrowserPool();
        }

        if (this.proxyConfiguration) {
            this._addProxyConfigurationToBrowserPool();
        }

        return this.browserPool;
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
                this._handleRequestTimeout(session, err.message);
            }
        }

        if (this.sessionPool && response) {
            if (typeof response === 'object' && typeof response.status === 'function') {
                this._throwOnBlockedRequest(session, response.status());
            } else {
                this.log.debug('Got a malformed Puppeteer response.', { request, response });
            }
        }

        return response;
    }
}

export default BrowserCrawler;
