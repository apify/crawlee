import { BasicCrawler, browserPoolCookieToToughCookie, ContextPipeline, cookieStringToToughCookie, EnqueueStrategy, NavigationSkippedError, OwnedOrInjected, remainingNavigationWindowMillis, RequestState, RequestThrottledError, resolveBaseUrlForEnqueueLinksFiltering, SessionError, toughCookieToBrowserPoolCookie, validators, } from '@crawlee/basic';
import { CLOUDFLARE_RETRY_CSS_SELECTORS, parseArgument, RETRY_CSS_SELECTORS, schemas, tryAbsoluteURL, } from '@crawlee/utils/internal';
import { sleep } from '@crawlee/utils';
import { z } from 'zod';
import { addTimeoutToPromise, TimeoutError, tryCancel } from '@apify/timeout';
/**
 * Rejects options that exist only to configure the browser pool the crawler would have built for itself.
 * Accepting them alongside a pre-built `browserPool` and quietly ignoring them is how `browserPoolOptions` grew
 * into a second, half-working way of configuring the same pool.
 */
export function assertBrowserPoolNotConfigured(crawlerName, ignoredOptions) {
    const names = Object.keys(ignoredOptions).filter((name) => ignoredOptions[name] !== undefined);
    if (names.length === 0) {
        return;
    }
    throw new Error(`${crawlerName}: ${names.map((name) => `\`${name}\``).join(', ')} cannot be combined with \`browserPool\`, ` +
        `${names.length > 1 ? 'they configure' : 'it configures'} the browser pool the crawler would build for ` +
        'itself. Configure the pool you pass in instead.');
}
const COOKIES_BEFORE_HOOKS = Symbol('cookiesBeforeHooks');
const readContextField = (ctx, key) => ctx[key];
/**
 * Whether an error thrown by `page.goto()` is a navigation timeout - either our own {@apilink TimeoutError}
 * or the driver's, which Playwright/Puppeteer report with their own class and a `Timeout ... exceeded` message
 * naming the raw millisecond value rather than the configured window.
 */
function isNavigationTimeoutError(error) {
    return (error instanceof TimeoutError ||
        error?.name === 'TimeoutError' ||
        error?.constructor?.name === 'TimeoutError' ||
        /timeout.*exceeded/i.test(error?.message ?? ''));
}
/**
 * Provides a simple framework for parallel crawling of web pages
 * using headless browsers with [Puppeteer](https://github.com/puppeteer/puppeteer)
 * and [Playwright](https://github.com/microsoft/playwright).
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * Since `BrowserCrawler` uses headless (or even headful) browsers to download web pages and extract data,
 * it is useful for crawling of websites that require to execute JavaScript.
 * If the target website doesn't need JavaScript, we should consider using the {@apilink CheerioCrawler},
 * which downloads the pages using raw HTTP requests and is about 10x faster.
 *
 * The source URLs are represented by the {@apilink Request} objects that are fed from the
 * {@apilink IRequestManager|request manager} provided via the {@apilink BrowserCrawlerOptions.requestManager|`requestManager`}
 * constructor option (a {@apilink RequestQueue} is itself a request manager). If no `requestManager` is provided,
 * the crawler will open the default request queue either when the {@apilink BrowserCrawler.addRequests|`crawler.addRequests()`} function is called,
 * or if `requests` parameter (representing the initial requests) of the {@apilink BrowserCrawler.run|`crawler.run()`} function is provided.
 *
 * To read from a read-only source such as a {@apilink RequestList} while still being able to enqueue new requests,
 * combine it with a queue into a {@apilink RequestManagerTandem} via {@apilink IRequestLoader.toTandem|`requestLoader.toTandem()`}
 * and pass the result as `requestManager`.
 *
 * > The {@apilink BrowserCrawlerOptions.requestList|`requestList`} and {@apilink BrowserCrawlerOptions.requestQueue|`requestQueue`}
 * > options are deprecated; they are still accepted and folded into a single `requestManager` for back-compat.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * `BrowserCrawler` opens a new browser page (i.e. tab or window) for each {@apilink Request} object to crawl
 * and then calls the function provided by user as the {@apilink BrowserCrawlerOptions.requestHandler|`requestHandler`} option.
 *
 * New pages are only opened when there is enough free CPU and memory available, as judged by the crawler's
 * {@apilink ConcurrencySystem}.
 * Concurrency is tuned via the `minConcurrency`, `maxConcurrency` and `maxRequestsPerMinute` options of the
 * `BrowserCrawler` constructor, or, for finer control, by injecting a pre-configured
 * {@apilink ConcurrencySystem|`concurrencySystem`}.
 *
 * > *NOTE:* the pool of browser instances is internally managed by the {@apilink BrowserPool} class.
 *
 * @category Crawlers
 */
export class BrowserCrawler extends BasicCrawler {
    /** Backs the {@apilink BrowserCrawler.browserPool|`browserPool`} getter. */
    #browserPoolDep;
    /**
     * A reference to the underlying browser pool that manages the crawler's browsers. Typed as
     * {@apilink IBrowserPool} so custom implementations can be plugged in via the `browserPool` constructor option.
     */
    get browserPool() {
        return this.#browserPoolDep.value;
    }
    launchContext;
    ignoreShadowRoots;
    ignoreIframes;
    #navigationTimeoutMillis;
    #preNavigationHooks;
    #postNavigationHooks;
    #saveResponseCookies;
    /**
     * @internal
     */
    static optionsShape = {
        ...BasicCrawler.optionsShape,
        navigationTimeoutSecs: schemas.anyNumber
            .refine((value) => value > 0, 'Expected a number greater than 0')
            .default(60),
        preNavigationHooks: schemas.anyArray.default(() => []),
        postNavigationHooks: schemas.anyArray.default(() => []),
        launchContext: schemas.anyObject.default(() => ({})),
        browserPool: validators.browserPool.optional(),
        browserPoolBuilder: schemas.anyFunction.optional(),
        remoteBrowser: schemas.anyObject.optional(),
        saveResponseCookies: z.boolean().default(true),
        proxyConfiguration: validators.proxyConfiguration.optional(),
        ignoreIframes: z.boolean().default(false),
        ignoreShadowRoots: z.boolean().default(false),
    };
    /** @internal */
    static optionsSchema = z.strictObject(BrowserCrawler.optionsShape);
    /**
     * All `BrowserCrawler` parameters are passed via an options object.
     */
    constructor(options) {
        const { navigationTimeoutSecs, saveResponseCookies, launchContext, browserPool, remoteBrowser, preNavigationHooks, postNavigationHooks, ignoreIframes, ignoreShadowRoots, contextPipelineBuilder, browserPoolBuilder, extendContext, ...basicCrawlerOptions } = parseArgument(options, BrowserCrawler.optionsSchema, 'BrowserCrawlerOptions');
        if (browserPool) {
            assertBrowserPoolNotConfigured(new.target.name, { remoteBrowser });
        }
        const skipGuard = (action) => ({
            action: async (ctx) => (ctx.request.skipNavigation ? {} : ((await action(ctx)) ?? {})),
        });
        super({
            ...basicCrawlerOptions,
            contextPipelineBuilder: () => {
                // A single navigation window covers the pre-navigation hooks, the navigation, and the
                // post-navigation hooks: the whole phase shares one `navigationTimeoutSecs` budget, so a slow
                // hook eats into the same window the navigation uses. The navigation itself is bounded by
                // capping its `gotoOptions.timeout` to the remaining budget.
                const windowGuard = (step) => skipGuard(async (ctx) => {
                    const remaining = remainingNavigationWindowMillis(ctx, this.#navigationTimeoutMillis);
                    if (remaining <= 0) {
                        throw new TimeoutError(`Navigation timed out after ${this.#navigationTimeoutMillis / 1000} seconds.`);
                    }
                    return addTimeoutToPromise(async () => step(ctx), remaining, `Navigation timed out after ${this.#navigationTimeoutMillis / 1000} seconds.`);
                });
                let pipeline = contextPipelineBuilder().compose({ action: this.prepareNavigation.bind(this) });
                for (const hook of this.#preNavigationHooks) {
                    pipeline = pipeline.compose(windowGuard(hook));
                }
                pipeline = pipeline.compose(skipGuard(this.navigate.bind(this)));
                for (const hook of this.#postNavigationHooks) {
                    pipeline = pipeline.compose(windowGuard(hook));
                }
                return pipeline
                    .compose(skipGuard(this.finalizeNavigation.bind(this)))
                    .compose({ action: this.handleBlockedRequestByContent.bind(this) })
                    .compose({ action: this.restoreRequestState.bind(this) });
            },
            extendContext,
        });
        this.launchContext = launchContext;
        this.#navigationTimeoutMillis = navigationTimeoutSecs * 1000;
        // The public option hooks are extension-aware; internal storage uses the base context type
        // (the pipeline composes hooks against the concrete context, which does not statically carry
        // `ContextExtension`). The extension members are present at runtime regardless.
        this.#preNavigationHooks = preNavigationHooks;
        this.#postNavigationHooks = postNavigationHooks;
        this.ignoreIframes = ignoreIframes;
        this.ignoreShadowRoots = ignoreShadowRoots;
        this.#saveResponseCookies = saveResponseCookies;
        this.#browserPoolDep = OwnedOrInjected.resolve(browserPool, () => browserPoolBuilder(remoteBrowser));
    }
    getNavigationTimeoutMillis() {
        return this.#navigationTimeoutMillis;
    }
    buildContextPipeline() {
        return ContextPipeline.create().compose({
            action: this.preparePage.bind(this),
            cleanup: async (context) => {
                context.registerDeferredCleanup(async () => {
                    const error = !context.session.isUsable()
                        ? new SessionError('Session is no longer usable')
                        : undefined;
                    await this.browserPool
                        .closePage(context.page, { error })
                        .catch((closeError) => this.log.debug('Error while closing page', { error: closeError }));
                });
            },
        });
    }
    async containsSelectors(page, selectors) {
        const foundSelectors = (await Promise.all(selectors.map((selector) => page.$(selector))))
            .map((x, i) => [x, selectors[i]])
            .filter(([x]) => x !== null)
            .map(([, selector]) => selector);
        return foundSelectors.length > 0 ? foundSelectors : null;
    }
    async isRequestBlocked(crawlingContext) {
        const { page, response } = crawlingContext;
        // Cloudflare specific heuristic - wait 5 seconds if we get a 403 for the JS challenge to load / resolve.
        if ((await this.containsSelectors(page, CLOUDFLARE_RETRY_CSS_SELECTORS)) && response?.status() === 403) {
            await sleep(5000);
            // here we cannot test for response code, because we only have the original response, not the possible Cloudflare redirect on passed challenge.
            const foundSelectors = await this.containsSelectors(page, RETRY_CSS_SELECTORS);
            if (!foundSelectors)
                return false;
            return `Cloudflare challenge failed, found selectors: ${foundSelectors.join(', ')}`;
        }
        const foundSelectors = await this.containsSelectors(page, RETRY_CSS_SELECTORS);
        const statusCode = response?.status() ?? 0;
        if (foundSelectors)
            return `Found selectors: ${foundSelectors.join(', ')}`;
        if (this.blockedStatusCodes.has(statusCode))
            return `Received blocked status code: ${statusCode}`;
        return false;
    }
    async preparePage(crawlingContext) {
        const page = await this.browserPool.newPage({
            id: crawlingContext.id,
            session: crawlingContext.session,
        });
        tryCancel();
        const addRequests = crawlingContext.addRequests;
        const extractLinks = async (options) => {
            return extractUrlsFromPage(page, options?.selector ?? 'a', options?.baseUrl ?? crawlingContext.request.loadedUrl ?? crawlingContext.request.url);
        };
        return {
            page,
            get response() {
                throw new Error("The `response` property is not available. This might mean that you're trying to access it before navigation or that navigation resulted in `null` (this should only happen with `about:` URLs)");
            },
            get gotoOptions() {
                throw new Error('The `gotoOptions` property is not available until `prepareNavigation` runs.');
            },
            extractLinks,
            enqueueLinks: async (options = {}) => {
                const baseUrl = resolveBaseUrlForEnqueueLinksFiltering({
                    enqueueStrategy: options.strategy,
                    finalRequestUrl: crawlingContext.request.loadedUrl,
                    originalRequestUrl: crawlingContext.request.url,
                    userProvidedBaseUrl: options.baseUrl,
                });
                const urls = await extractLinks(options);
                return addRequests(urls, {
                    ...options,
                    baseUrl,
                    strategy: options.strategy ?? EnqueueStrategy.SameHostname,
                });
            },
        };
    }
    async prepareNavigation(crawlingContext) {
        if (crawlingContext.request.skipNavigation) {
            return {
                request: new Proxy(crawlingContext.request, {
                    get(target, propertyName, receiver) {
                        if (propertyName === 'loadedUrl') {
                            throw new NavigationSkippedError('The `request.loadedUrl` property is not available - `skipNavigation` was used');
                        }
                        return Reflect.get(target, propertyName, receiver);
                    },
                }),
                get response() {
                    throw new NavigationSkippedError('The `response` property is not available - `skipNavigation` was used');
                },
            };
        }
        crawlingContext.request.state = RequestState.BEFORE_NAV;
        return {
            // Default to the full navigation timeout so a pre-navigation hook can read it; `navigate` narrows it
            // to the remaining shared window unless a hook overrode it (see there).
            gotoOptions: { timeout: this.#navigationTimeoutMillis },
            [COOKIES_BEFORE_HOOKS]: this.getCookieHeaderFromRequest(crawlingContext.request),
        };
    }
    async navigate(crawlingContext) {
        tryCancel();
        const gotoOptions = crawlingContext.gotoOptions;
        const remaining = remainingNavigationWindowMillis(crawlingContext, this.#navigationTimeoutMillis);
        if (remaining <= 0) {
            throw new TimeoutError(`Navigation timed out after ${this.#navigationTimeoutMillis / 1000} seconds.`);
        }
        // If a hook left the default `navigationTimeoutMillis` in place, bound the goto to whatever is left of the
        // shared navigation window. If it overrode the value - including `0`, Playwright's "no timeout" - honour
        // that verbatim as the goto's own timeout. The driver enforces this natively (so a timed-out goto is
        // aborted, not left lingering) and `handleNavigationTimeout` turns its error into our own message.
        const gotoTimeout = gotoOptions;
        if (gotoTimeout.timeout === this.#navigationTimeoutMillis) {
            gotoTimeout.timeout = remaining;
        }
        const cookiesBeforeHooks = readContextField(crawlingContext, COOKIES_BEFORE_HOOKS);
        const cookiesAfterHooks = this.getCookieHeaderFromRequest(crawlingContext.request);
        await this.applyCookies(crawlingContext, cookiesBeforeHooks, cookiesAfterHooks);
        let response;
        try {
            response = (await this.navigationHandler(crawlingContext, gotoOptions)) ?? undefined;
        }
        catch (error) {
            await this.handleNavigationTimeout(crawlingContext, error);
            crawlingContext.request.state = RequestState.ERROR;
            this.throwIfProxyError(error);
            throw error;
        }
        tryCancel();
        crawlingContext.request.state = RequestState.AFTER_NAV;
        return { response };
    }
    async finalizeNavigation(crawlingContext) {
        tryCancel();
        let response;
        try {
            response = crawlingContext.response;
        }
        catch {
            // `preparePage` installs a throwing getter for `response`; reaching this branch means
            // navigation produced no response and no hook overrode it. Treat as undefined.
        }
        await this.processResponse(response, crawlingContext);
        tryCancel();
        // Persist cookies from the navigation response before the user handler runs.
        // Cookies set during `requestHandler` are saved again afterwards.
        await this.persistCookiesFromPage(crawlingContext);
        return { request: crawlingContext.request };
    }
    /**
     * Copies cookies from the live browser page into the session cookie jar.
     */
    async persistCookiesFromPage(crawlingContext) {
        if (!this.#saveResponseCookies || !crawlingContext.session) {
            return;
        }
        const { cookies } = await this.browserPool.extractPageState(crawlingContext.page);
        tryCancel();
        // Prefer the live page URL — the handler may have navigated after the initial load.
        const url = (await crawlingContext.page.url()) || crawlingContext.request.loadedUrl || crawlingContext.request.url;
        for (const cookie of cookies) {
            try {
                await crawlingContext.session.cookieJar.setCookie(browserPoolCookieToToughCookie(cookie), url, {
                    ignoreError: false,
                });
            }
            catch (e) {
                this.log.debug(`Could not set cookie: ${e.message}`);
            }
        }
    }
    /**
     * Runs the user request handler, then re-reads browser cookies so login flows /
     * `page.setCookie` / XHR `Set-Cookie` updates are stored for later requests.
     */
    async runRequestHandler(crawlingContext) {
        try {
            await super.runRequestHandler(crawlingContext);
        }
        finally {
            if (!crawlingContext.request.skipNavigation) {
                try {
                    await this.persistCookiesFromPage(crawlingContext);
                }
                catch {
                    // Page may already be closed on some failure paths; ignore.
                }
            }
        }
    }
    async handleBlockedRequestByContent(crawlingContext) {
        if (this.retryOnBlocked) {
            const error = await this.isRequestBlocked(crawlingContext);
            if (error)
                throw new SessionError(error);
        }
        return {};
    }
    async restoreRequestState(crawlingContext) {
        crawlingContext.request.state = RequestState.REQUEST_HANDLER;
        return {};
    }
    async applyCookies({ session, request, page }, preHooksCookies, postHooksCookies) {
        const sessionCookie = session
            ? (await session.cookieJar.getCookies(request.url)).map(toughCookieToBrowserPoolCookie)
            : [];
        const parsedPreHooksCookies = preHooksCookies.split(/ *; */).map((c) => cookieStringToToughCookie(c));
        const parsedPostHooksCookies = postHooksCookies.split(/ *; */).map((c) => cookieStringToToughCookie(c));
        const cookies = [...sessionCookie, ...parsedPreHooksCookies, ...parsedPostHooksCookies]
            .filter((c) => typeof c !== 'undefined' && c !== null)
            .map((c) => ({ ...c, url: c.domain ? undefined : request.url }));
        await this.browserPool.injectPageState(page, { cookies });
    }
    /**
     * Marks session bad on navigation timeout, and stops in-flight page loading on any navigation error.
     */
    async handleNavigationTimeout(crawlingContext, error) {
        const { session, page } = crawlingContext;
        // Fire-and-forget: no user code will run on this page after a failed navigation.
        // Swallow rejections: the page may already be detached.
        void page.evaluate(() => window.stop()).catch(() => { });
        if (isNavigationTimeoutError(error)) {
            session?.markBad();
            // The driver was handed the remaining window (usually shorter than `navigationTimeoutSecs` once the
            // hooks have run), so it names that value in its own error; report the configured window instead.
            throw new TimeoutError(`Navigation timed out after ${this.#navigationTimeoutMillis / 1000} seconds.`);
        }
    }
    /**
     * Transforms proxy-related errors to `SessionError`.
     */
    throwIfProxyError(error) {
        if (this.isProxyError(error)) {
            throw new SessionError(this.getMessageFromError(error));
        }
    }
    async processResponse(response, crawlingContext) {
        const { session, request, page } = crawlingContext;
        if (typeof response === 'object' && typeof response.status === 'function') {
            const status = response.status();
            this.statistics.registerStatusCode(status);
            // Ahead of the error-status throw below: a 429 the user opted into treating as an error is still a
            // rate limit the domain should back off from.
            if (status === 429) {
                // Both drivers lower-case header names and join duplicates, so a plain lookup is enough.
                const retryAfter = response.headers?.()['retry-after'];
                if (this.recordDomainRateLimit(crawlingContext.request.url, retryAfter)) {
                    throw new RequestThrottledError(`${crawlingContext.request.url} responded with 429.`);
                }
            }
            if (this.isErrorStatusCode(status)) {
                if (this.additionalHttpErrorStatusCodes.has(status)) {
                    throw new Error(`${status} - Error status code was set by user.`);
                }
                throw new Error(`${status} - Internal Server Error`);
            }
        }
        if (this.sessionPool && response && session) {
            if (typeof response === 'object' && typeof response.status === 'function') {
                this.throwOnBlockedRequest(response.status());
            }
            else {
                this.log.debug('Got a malformed Browser response.', { request, response });
            }
        }
        request.loadedUrl = await page.url();
    }
    /**
     * Function for cleaning up after all requests are processed.
     * @ignore
     */
    async teardown() {
        await this.#browserPoolDep.ifOwned((pool) => pool.destroy());
        await super.teardown();
    }
}
/**
 * Extracts URLs from a given page.
 * @ignore
 */
export async function extractUrlsFromPage(
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
page, selector, baseUrl) {
    const urls = (await page.$$eval(selector, (linkEls) => linkEls.map((link) => link.getAttribute('href')).filter((href) => !!href))) ?? [];
    const [base] = await page.$$eval('base', (els) => els.map((el) => el.getAttribute('href')));
    const absoluteBaseUrl = base && tryAbsoluteURL(base, baseUrl);
    if (absoluteBaseUrl) {
        baseUrl = absoluteBaseUrl;
    }
    return urls
        .map((href) => {
        // Throw a meaningful error when only a relative URL would be extracted instead of waiting for the Request to fail later.
        const isHrefAbsolute = /^[a-z][a-z0-9+.-]*:/.test(href); // Grabbed this in 'is-absolute-url' package.
        if (!isHrefAbsolute && !baseUrl) {
            throw new Error(`An extracted URL: ${href} is relative and options.baseUrl is not set. ` +
                'Use options.baseUrl in enqueueLinks() to automatically resolve relative URLs.');
        }
        return baseUrl ? tryAbsoluteURL(href, baseUrl) : href;
    })
        .filter((href) => !!href);
}
