/**
 * A namespace that contains various utilities for
 * [Playwright](https://github.com/microsoft/playwright) - the headless Chrome Node API.
 *
 * **Example usage:**
 *
 * ```javascript
 * import { launchPlaywright, playwrightUtils } from 'crawlee';
 *
 * // Navigate to https://www.example.com in Playwright with a POST request
 * const browser = await launchPlaywright();
 * const page = await browser.newPage();
 * await playwrightUtils.gotoExtended(page, {
 *     url: 'https://example.com,
 *     method: 'POST',
 * });
 * ```
 * @module playwrightUtils
 */
// @ts-ignore optional peer dependency
import type { Page, Response } from 'playwright';
import type { Request } from '@crawlee/browser';
import type { CheerioRoot, Dictionary } from '@crawlee/utils';
import type { BatchAddRequestsResult } from '@crawlee/types';
import type { PlaywrightCrawlingContext } from '../playwright-crawler';
import type { EnqueueLinksByClickingElementsOptions } from '../enqueue-links/click-elements';
import { enqueueLinksByClickingElements } from '../enqueue-links/click-elements';
export interface InjectFileOptions {
    /**
     * Enables the injected script to survive page navigations and reloads without need to be re-injected manually.
     * This does not mean, however, that internal state will be preserved. Just that it will be automatically
     * re-injected on each navigation before any other scripts get the chance to execute.
     */
    surviveNavigations?: boolean;
}
export interface BlockRequestsOptions {
    /**
     * The patterns of URLs to block from being loaded by the browser.
     * Only `*` can be used as a wildcard. It is also automatically added to the beginning
     * and end of the pattern. This limitation is enforced by the DevTools protocol.
     * `.png` is the same as `*.png*`.
     */
    urlPatterns?: string[];
    /**
     * If you just want to append to the default blocked patterns, use this property.
     */
    extraUrlPatterns?: string[];
}
/**
 * Injects a JavaScript file into a Playwright page.
 * Unlike Playwright's `addScriptTag` function, this function works on pages
 * with arbitrary Cross-Origin Resource Sharing (CORS) policies.
 *
 * File contents are cached for up to 10 files to limit file system access.
 *
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param filePath File path
 * @param [options]
 */
export declare function injectFile(page: Page, filePath: string, options?: InjectFileOptions): Promise<unknown>;
/**
 * Injects the [jQuery](https://jquery.com/) library into a Playwright page.
 * jQuery is often useful for various web scraping and crawling tasks.
 * For example, it can help extract text from HTML elements using CSS selectors.
 *
 * Beware that the injected jQuery object will be set to the `window.$` variable and thus it might cause conflicts with
 * other libraries included by the page that use the same variable name (e.g. another version of jQuery).
 * This can affect functionality of page's scripts.
 *
 * The injected jQuery will survive page navigations and reloads by default.
 *
 * **Example usage:**
 * ```javascript
 * await playwrightUtils.injectJQuery(page);
 * const title = await page.evaluate(() => {
 *   return $('head title').text();
 * });
 * ```
 *
 * Note that `injectJQuery()` does not affect the Playwright
 * [`page.$()`](https://playwright.dev/docs/api/class-page#page-query-selector)
 * function in any way.
 *
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param [options.surviveNavigations] Opt-out option to disable the JQuery reinjection after navigation.
 */
export declare function injectJQuery(page: Page, options?: {
    surviveNavigations?: boolean;
}): Promise<unknown>;
export interface DirectNavigationOptions {
    /**
     * Maximum operation time in milliseconds, defaults to 30 seconds, pass `0` to disable timeout. The
     * default value can be changed by using the browserContext.setDefaultNavigationTimeout(timeout),
     * browserContext.setDefaultTimeout(timeout), page.setDefaultNavigationTimeout(timeout) or
     * page.setDefaultTimeout(timeout) methods.
     */
    timeout?: number;
    /**
     * When to consider operation succeeded, defaults to `load`. Events can be either:
     * - `'domcontentloaded'` - consider operation to be finished when the `DOMContentLoaded` event is fired.
     * - `'load'` - consider operation to be finished when the `load` event is fired.
     * - `'networkidle'` - consider operation to be finished when there are no network connections for at least `500` ms.
     */
    waitUntil?: 'domcontentloaded' | 'load' | 'networkidle';
    /**
     * Referer header value. If provided it will take preference over the referer header value set by page.setExtraHTTPHeaders(headers).
     */
    referer?: string;
}
/**
 * Extended version of Playwright's `page.goto()` allowing to perform requests with HTTP method other than GET,
 * with custom headers and POST payload. URL, method, headers and payload are taken from
 * request parameter that must be an instance of Request class.
 *
 * *NOTE:* In recent versions of Playwright using requests other than GET, overriding headers and adding payloads disables
 * browser cache which degrades performance.
 *
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param request
 * @param [gotoOptions] Custom options for `page.goto()`.
 */
export declare function gotoExtended(page: Page, request: Request, gotoOptions?: DirectNavigationOptions): Promise<Response | null>;
/**
 * > This is a **Chromium-only feature.**
 * >
 * > Using this option with Firefox and WebKit browsers doesn't have any effect.
 * > To set up request blocking for these browsers, use `page.route()` instead.
 *
 * Forces the Playwright browser tab to block loading URLs that match a provided pattern.
 * This is useful to speed up crawling of websites, since it reduces the amount
 * of data that needs to be downloaded from the web, but it may break some websites
 * or unexpectedly prevent loading of resources.
 *
 * By default, the function will block all URLs including the following patterns:
 *
 * ```json
 * [".css", ".jpg", ".jpeg", ".png", ".svg", ".gif", ".woff", ".pdf", ".zip"]
 * ```
 *
 * If you want to extend this list further, use the `extraUrlPatterns` option,
 * which will keep blocking the default patterns, as well as add your custom ones.
 * If you would like to block only specific patterns, use the `urlPatterns` option,
 * which will override the defaults and block only URLs with your custom patterns.
 *
 * This function does not use Playwright's request interception and therefore does not interfere
 * with browser cache. It's also faster than blocking requests using interception,
 * because the blocking happens directly in the browser without the round-trip to Node.js,
 * but it does not provide the extra benefits of request interception.
 *
 * The function will never block main document loads and their respective redirects.
 *
 * **Example usage**
 * ```javascript
 * import { launchPlaywright, playwrightUtils } from 'crawlee';
 *
 * const browser = await launchPlaywright();
 * const page = await browser.newPage();
 *
 * // Block all requests to URLs that include `adsbygoogle.js` and also all defaults.
 * await playwrightUtils.blockRequests(page, {
 *     extraUrlPatterns: ['adsbygoogle.js'],
 * });
 *
 * await page.goto('https://cnn.com');
 * ```
 *
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param [options]
 */
export declare function blockRequests(page: Page, options?: BlockRequestsOptions): Promise<void>;
export interface CompiledScriptParams {
    page: Page;
    request: Request;
}
export type CompiledScriptFunction = (params: CompiledScriptParams) => Promise<unknown>;
/**
 * Compiles a Playwright script into an async function that may be executed at any time
 * by providing it with the following object:
 * ```
 * {
 *    page: Page,
 *    request: Request,
 * }
 * ```
 * Where `page` is a Playwright [`Page`](https://playwright.dev/docs/api/class-page)
 * and `request` is a {@apilink Request}.
 *
 * The function is compiled by using the `scriptString` parameter as the function's body,
 * so any limitations to function bodies apply. Return value of the compiled function
 * is the return value of the function body = the `scriptString` parameter.
 *
 * As a security measure, no globals such as `process` or `require` are accessible
 * from within the function body. Note that the function does not provide a safe
 * sandbox and even though globals are not easily accessible, malicious code may
 * still execute in the main process via prototype manipulation. Therefore you
 * should only use this function to execute sanitized or safe code.
 *
 * Custom context may also be provided using the `context` parameter. To improve security,
 * make sure to only pass the really necessary objects to the context. Preferably making
 * secured copies beforehand.
 */
export declare function compileScript(scriptString: string, context?: Dictionary): CompiledScriptFunction;
export interface InfiniteScrollOptions {
    /**
     * How many seconds to scroll for. If 0, will scroll until bottom of page.
     * @default 1
     */
    timeoutSecs?: number;
    /**
     * How many seconds to wait for no new content to load before exit.
     * @default 4
     */
    waitForSecs?: number;
    /**
     * If true, it will scroll up a bit after each scroll down. This is required on some websites for the scroll to work.
     * @default false
     */
    scrollDownAndUp?: boolean;
    /**
     * Optionally checks and clicks a button if it appears while scrolling. This is required on some websites for the scroll to work.
     */
    buttonSelector?: string;
    /**
     * This function is called after every scroll and stops the scrolling process if it returns `true`. The function can be `async`.
     */
    stopScrollCallback?: () => unknown | Promise<unknown>;
}
/**
 * Scrolls to the bottom of a page, or until it times out.
 * Loads dynamic content when it hits the bottom of a page, and then continues scrolling.
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param [options]
 */
export declare function infiniteScroll(page: Page, options?: InfiniteScrollOptions): Promise<void>;
export interface SaveSnapshotOptions {
    /**
     * Key under which the screenshot and HTML will be saved. `.jpg` will be appended for screenshot and `.html` for HTML.
     * @default 'SNAPSHOT'
     */
    key?: string;
    /**
     * The quality of the image, between 0-100. Higher quality images have bigger size and require more storage.
     * @default 50
     */
    screenshotQuality?: number;
    /**
     * If true, it will save a full screenshot of the current page as a record with `key` appended by `.jpg`.
     * @default true
     */
    saveScreenshot?: boolean;
    /**
     * If true, it will save a full HTML of the current page as a record with `key` appended by `.html`.
     * @default true
     */
    saveHtml?: boolean;
    /**
     * Name or id of the Key-Value store where snapshot is saved. By default it is saved to default Key-Value store.
     * @default null
     */
    keyValueStoreName?: string | null;
}
/**
 * Saves a full screenshot and HTML of the current page into a Key-Value store.
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param [options]
 */
export declare function saveSnapshot(page: Page, options?: SaveSnapshotOptions): Promise<void>;
/**
 * Returns Cheerio handle for `page.content()`, allowing to work with the data same way as with {@apilink CheerioCrawler}.
 *
 * **Example usage:**
 * ```javascript
 * const $ = await playwrightUtils.parseWithCheerio(page);
 * const title = $('title').text();
 * ```
 *
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 */
export declare function parseWithCheerio(page: Page): Promise<CheerioRoot>;
/** @internal */
export interface PlaywrightContextUtils {
    /**
     * Injects a JavaScript file into current `page`.
     * Unlike Playwright's `addScriptTag` function, this function works on pages
     * with arbitrary Cross-Origin Resource Sharing (CORS) policies.
     *
     * File contents are cached for up to 10 files to limit file system access.
     */
    injectFile(filePath: string, options?: InjectFileOptions): Promise<unknown>;
    /**
     * Injects the [jQuery](https://jquery.com/) library into current `page`.
     * jQuery is often useful for various web scraping and crawling tasks.
     * For example, it can help extract text from HTML elements using CSS selectors.
     *
     * Beware that the injected jQuery object will be set to the `window.$` variable and thus it might cause conflicts with
     * other libraries included by the page that use the same variable name (e.g. another version of jQuery).
     * This can affect functionality of page's scripts.
     *
     * The injected jQuery will survive page navigations and reloads.
     *
     * **Example usage:**
     * ```javascript
     * async requestHandler({ page, injectJQuery }) {
     *     await injectJQuery();
     *     const title = await page.evaluate(() => {
     *         return $('head title').text();
     *     });
     * });
     * ```
     *
     * Note that `injectJQuery()` does not affect the Playwright
     * [`page.$()`](https://playwright.dev/docs/api/class-page#page-query-selector)
     * function in any way.
     */
    injectJQuery(): Promise<unknown>;
    /**
     * Forces the Playwright browser tab to block loading URLs that match a provided pattern.
     * This is useful to speed up crawling of websites, since it reduces the amount
     * of data that needs to be downloaded from the web, but it may break some websites
     * or unexpectedly prevent loading of resources.
     *
     * By default, the function will block all URLs including the following patterns:
     *
     * ```json
     * [".css", ".jpg", ".jpeg", ".png", ".svg", ".gif", ".woff", ".pdf", ".zip"]
     * ```
     *
     * If you want to extend this list further, use the `extraUrlPatterns` option,
     * which will keep blocking the default patterns, as well as add your custom ones.
     * If you would like to block only specific patterns, use the `urlPatterns` option,
     * which will override the defaults and block only URLs with your custom patterns.
     *
     * This function does not use Playwright's request interception and therefore does not interfere
     * with browser cache. It's also faster than blocking requests using interception,
     * because the blocking happens directly in the browser without the round-trip to Node.js,
     * but it does not provide the extra benefits of request interception.
     *
     * The function will never block main document loads and their respective redirects.
     *
     * **Example usage**
     * ```javascript
     * preNavigationHooks: [
     *     async ({ blockRequests }) => {
     *         // Block all requests to URLs that include `adsbygoogle.js` and also all defaults.
     *         await blockRequests({
     *             extraUrlPatterns: ['adsbygoogle.js'],
     *         }),
     *     }),
     * ],
     * ```
     */
    blockRequests(options?: BlockRequestsOptions): Promise<void>;
    /**
     * Returns Cheerio handle for `page.content()`, allowing to work with the data same way as with {@apilink CheerioCrawler}.
     *
     * **Example usage:**
     * ```javascript
     * async requestHandler({ parseWithCheerio }) {
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    parseWithCheerio(): Promise<CheerioRoot>;
    /**
     * Scrolls to the bottom of a page, or until it times out.
     * Loads dynamic content when it hits the bottom of a page, and then continues scrolling.
     */
    infiniteScroll(options?: InfiniteScrollOptions): Promise<void>;
    /**
     * Saves a full screenshot and HTML of the current page into a Key-Value store.
     * @param [options]
     */
    saveSnapshot(options?: SaveSnapshotOptions): Promise<void>;
    /**
     * The function finds elements matching a specific CSS selector in a Playwright page,
     * clicks all those elements using a mouse move and a left mouse button click and intercepts
     * all the navigation requests that are subsequently produced by the page. The intercepted
     * requests, including their methods, headers and payloads are then enqueued to a provided
     * {@apilink RequestQueue}. This is useful to crawl JavaScript heavy pages where links are not available
     * in `href` elements, but rather navigations are triggered in click handlers.
     * If you're looking to find URLs in `href` attributes of the page, see {@apilink enqueueLinks}.
     *
     * Optionally, the function allows you to filter the target links' URLs using an array of {@apilink PseudoUrl} objects
     * and override settings of the enqueued {@apilink Request} objects.
     *
     * **IMPORTANT**: To be able to do this, this function uses various mutations on the page,
     * such as changing the Z-index of elements being clicked and their visibility. Therefore,
     * it is recommended to only use this function as the last operation in the page.
     *
     * **USING HEADFUL BROWSER**: When using a headful browser, this function will only be able to click elements
     * in the focused tab, effectively limiting concurrency to 1. In headless mode, full concurrency can be achieved.
     *
     * **PERFORMANCE**: Clicking elements with a mouse and intercepting requests is not a low level operation
     * that takes nanoseconds. It's not very CPU intensive, but it takes time. We strongly recommend limiting
     * the scope of the clicking as much as possible by using a specific selector that targets only the elements
     * that you assume or know will produce a navigation. You can certainly click everything by using
     * the `*` selector, but be prepared to wait minutes to get results on a large and complex page.
     *
     * **Example usage**
     *
     * ```javascript
     * async requestHandler({ enqueueLinksByClickingElements }) {
     *     await enqueueLinksByClickingElements({
     *         selector: 'a.product-detail',
     *         globs: [
     *             'https://www.example.com/handbags/**'
     *             'https://www.example.com/purses/**'
     *         ],
     *     });
     * });
     * ```
     *
     * @returns Promise that resolves to {@apilink BatchAddRequestsResult} object.
     */
    enqueueLinksByClickingElements(options: Omit<EnqueueLinksByClickingElementsOptions, 'page' | 'requestQueue'>): Promise<BatchAddRequestsResult>;
    /**
    * Compiles a Playwright script into an async function that may be executed at any time
    * by providing it with the following object:
    * ```
    * {
    *    page: Page,
    *    request: Request,
    * }
    * ```
    * Where `page` is a Playwright [`Page`](https://playwright.dev/docs/api/class-page)
    * and `request` is a {@apilink Request}.
    *
    * The function is compiled by using the `scriptString` parameter as the function's body,
    * so any limitations to function bodies apply. Return value of the compiled function
    * is the return value of the function body = the `scriptString` parameter.
    *
    * As a security measure, no globals such as `process` or `require` are accessible
    * from within the function body. Note that the function does not provide a safe
    * sandbox and even though globals are not easily accessible, malicious code may
    * still execute in the main process via prototype manipulation. Therefore you
    * should only use this function to execute sanitized or safe code.
    *
    * Custom context may also be provided using the `context` parameter. To improve security,
    * make sure to only pass the really necessary objects to the context. Preferably making
    * secured copies beforehand.
    */
    compileScript(scriptString: string, ctx?: Dictionary): CompiledScriptFunction;
}
export declare function registerUtilsToContext(context: PlaywrightCrawlingContext): void;
export { enqueueLinksByClickingElements };
/** @internal */
export declare const playwrightUtils: {
    injectFile: typeof injectFile;
    injectJQuery: typeof injectJQuery;
    gotoExtended: typeof gotoExtended;
    blockRequests: typeof blockRequests;
    enqueueLinksByClickingElements: typeof enqueueLinksByClickingElements;
    parseWithCheerio: typeof parseWithCheerio;
    infiniteScroll: typeof infiniteScroll;
    saveSnapshot: typeof saveSnapshot;
    compileScript: typeof compileScript;
};
//# sourceMappingURL=playwright-utils.d.ts.map