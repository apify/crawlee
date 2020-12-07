import ow from 'ow';
import { BrowserPool, BrowserControllerContext } from 'browser-pool'; // eslint-disable-line import/no-duplicates
import { BASIC_CRAWLER_TIMEOUT_MULTIPLIER } from '../constants';
import { gotoExtended } from '../puppeteer_utils';
import { SessionPool } from '../session_pool/session_pool'; // eslint-disable-line import/no-duplicates
import { addTimeoutToPromise } from '../utils';
import BasicCrawler from './basic_crawler'; // eslint-disable-line import/no-duplicates
import { validators } from '../validators';
import {
    throwOnBlockedRequest,
} from './crawler_utils';

// eslint-enable-line import/no-duplicates

class BrowserCrawler extends BasicCrawler{
    static optionsShape = {
        ...BasicCrawler.optionsShape,
        // TODO temporary until the API is unified in V2
        handleRequestFunction: ow.undefined,

        handlePageFunction: ow.function,
        gotoFunction: ow.function,

        handlePageTimeoutSecs: ow.optional.number,
        preNavigationHooks: ow.optional.array,
        postNavigationHooks: ow.optional.array,

        browserPoolOptions: ow.object,
        sessionPoolOptions: ow.optional.object,
        persistCookiesPerSession: ow.optional.boolean,
        useSessionPool: ow.optional.boolean,
        proxyConfiguration: ow.optional.object.validate(validators.proxyConfiguration),
    };

    constructor(options) {
        ow(options, 'BrowserCrawlerOptions', ow.object.exactShape(BrowserCrawler.optionsShape));
        const {
            handlePageFunction,
            handlePageTimeoutSecs = 60,
            gotoTimeoutSecs = 60,
            gotoFunction,
            persistCookiesPerSession = true,
            useSessionPool = true,
            sessionPoolOptions,
            proxyConfiguration,
            browserPoolOptions,
            preNavigationHooks = [],
            postNavigationHooks = [],
            ...basicCrawlerOptions
        } = options;

        if (!useSessionPool && persistCookiesPerSession) {
            throw new Error('You cannot use "persistCookiesPerSession" without "useSessionPool" set to true.');
        }

        super({
            ...basicCrawlerOptions,
            handleRequestFunction: (...args) => this._handleRequestFunction(...args),
            handleRequestTimeoutSecs: handlePageTimeoutSecs * BASIC_CRAWLER_TIMEOUT_MULTIPLIER,
        })

        this.handlePageFunction = handlePageFunction;

        this.handlePageTimeoutSecs = handlePageTimeoutSecs;
        this.handlePageTimeoutMillis = this.handlePageTimeoutSecs * 1000;
        this.gotoTimeoutMillis = gotoTimeoutSecs * 1000;

        this.persistCookiesPerSession = persistCookiesPerSession;
        this.proxyConfiguration = proxyConfiguration;

        this.preNavigationHooks = preNavigationHooks;
        this.postNavigationHooks = postNavigationHooks;

        if (useSessionPool) {
            this.sessionPool = new SessionPool({
                ...sessionPoolOptions,
                log: this.log,
            });
        }

        this.browserPool = new BrowserPool({
            ...browserPoolOptions,
            browserPlugins: browserPoolOptions.browserPlugins.map((plugin) => {
                if (this.proxyConfiguration || this.sessionPool) {
                    plugin.createContextFunction = this._createContextFunction.bind(this);
                }
                return plugin;
            }),
        });
    }

    _addSessionPoolToBrowserPool() {
        // @TODO: proper session retirement in this.browserPool.postPageCloseHooks
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

        crawlingContext.session = browserControllerInstance.session;
        crawlingContext.proxyInfo = browserControllerInstance.proxyInfo;

        crawlingContext.crawler = this;
    }

    async _handleNavigation(crawlingContext) {
        try {
            await this._executeHooks(this.preNavigationHooks, crawlingContext);
            crawlingContext.response = await this.gotoFunction(crawlingContext);;
        } catch (err) {
            crawlingContext.error = err;

            return this._executeHooks(this.postNavigationHooks, crawlingContext);
        }

        await this._executeHooks(this.postNavigationHooks, crawlingContext);
    }

    async _navigationHandler(crawlingContext) {
        return this.gotoFunction(crawlingContext);
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

    async _createContextFunction(pluginOptions) {
        let session;
        let proxyInfo;
        let proxyUrl;

        if (this.sessionPool) {
            session = await this.sessionPool.getSession();
        }

        if (this.proxyConfiguration) {
            proxyInfo = await this.proxyConfiguration.newProxyInfo(session && session.id);
            proxyUrl = proxyInfo.url;
        }

        return new BrowserControllerContext({ pluginOptions, proxyUrl, proxyInfo, session });
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
