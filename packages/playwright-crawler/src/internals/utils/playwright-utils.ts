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

import { readFile } from 'node:fs/promises';
import ow from 'ow';
import type { Page, Response, Route } from 'playwright';
import { LruCache } from '@apify/datastructures';
import log_ from '@apify/log';
import type { Request } from '@crawlee/core';
import { validators } from '@crawlee/core';
import type { CheerioRoot, Dictionary } from '@crawlee/utils';
import * as cheerio from 'cheerio';
import type { PlaywrightCrawlingContext } from '../playwright-crawler';

const log = log_.child({ prefix: 'Playwright Utils' });

const jqueryPath = require.resolve('jquery');

const MAX_INJECT_FILE_CACHE_SIZE = 10;

export interface InjectFileOptions {
    /**
     * Enables the injected script to survive page navigations and reloads without need to be re-injected manually.
     * This does not mean, however, that internal state will be preserved. Just that it will be automatically
     * re-injected on each navigation before any other scripts get the chance to execute.
     */
    surviveNavigations?: boolean;
}

/**
 * Cache contents of previously injected files to limit file system access.
 */
const injectedFilesCache = new LruCache({ maxLength: MAX_INJECT_FILE_CACHE_SIZE });

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
export async function injectFile(page: Page, filePath: string, options: InjectFileOptions = {}): Promise<unknown> {
    ow(page, ow.object.validate(validators.browserPage));
    ow(filePath, ow.string);
    ow(options, ow.object.exactShape({
        surviveNavigations: ow.optional.boolean,
    }));

    let contents = injectedFilesCache.get(filePath);
    if (!contents) {
        contents = await readFile(filePath, 'utf8');
        injectedFilesCache.add(filePath, contents);
    }
    const evalP = page.evaluate(contents);

    if (options.surviveNavigations) {
        page.on('framenavigated',
            () => page.evaluate(contents)
                .catch((error) => log.warning('An error occurred during the script injection!', { error })));
    }

    return evalP;
}

/**
 * Injects the [jQuery](https://jquery.com/) library into a Playwright page.
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
 */
export function injectJQuery(page: Page): Promise<unknown> {
    ow(page, ow.object.validate(validators.browserPage));
    return injectFile(page, jqueryPath, { surviveNavigations: true });
}

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
export async function gotoExtended(page: Page, request: Request, gotoOptions: DirectNavigationOptions = {}): Promise<Response | null> {
    ow(page, ow.object.validate(validators.browserPage));
    ow(request, ow.object.partialShape({
        url: ow.string.url,
        method: ow.optional.string,
        headers: ow.optional.object,
        payload: ow.optional.any(ow.string, ow.buffer),
    }));
    ow(gotoOptions, ow.object);

    const { url, method, headers, payload } = request;
    const isEmpty = (o?: object) => !o || Object.keys(o).length === 0;

    if (method !== 'GET' || payload || !isEmpty(headers)) {
        // This is not deprecated, we use it to log only once.
        log.deprecated('Using other request methods than GET, rewriting headers and adding payloads has a high impact on performance '
            + 'in recent versions of Playwright. Use only when necessary.');
        let wasCalled = false;
        const interceptRequestHandler = async (route: Route) => {
            try {
                // We want to ensure that this won't get executed again in a case that there is a subsequent request
                // for example for some asset file link from main HTML.
                if (wasCalled) {
                    return await route.continue();
                }

                wasCalled = true;
                const overrides: Dictionary = {};

                if (method !== 'GET') overrides.method = method;
                if (payload) overrides.postData = payload;
                if (!isEmpty(headers)) overrides.headers = headers;
                await route.continue(overrides);
            } catch (error) {
                log.debug('Error inside request interceptor', { error });
            }
        };

        await page.route('**/*', interceptRequestHandler);
    }

    return page.goto(url, gotoOptions);
}

/**
 * Returns Cheerio handle for `page.content()`, allowing to work with the data same way as with {@link CheerioCrawler}.
 *
 * **Example usage:**
 * ```javascript
 * const $ = await playwrightUtils.parseWithCheerio(page);
 * const title = $('title').text();
 * ```
 *
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 */
export async function parseWithCheerio(page: Page): Promise<CheerioRoot> {
    ow(page, ow.object.validate(validators.browserPage));
    const pageContent = await page.content();
    return cheerio.load(pageContent);
}

export interface PlaywrightContextUtils {
    injectFile(filePath: string, options?: InjectFileOptions): Promise<unknown>;
    injectJQuery(): Promise<unknown>;
    parseWithCheerio(): Promise<CheerioRoot>;
}

export function registerUtilsToContext(context: PlaywrightCrawlingContext): void {
    context.injectFile = (filePath: string, options?: InjectFileOptions) => injectFile(context.page, filePath, options);
    context.injectJQuery = () => injectJQuery(context.page);
    context.parseWithCheerio = () => parseWithCheerio(context.page);
}

/** @internal */
export const playwrightUtils = {
    injectFile,
    injectJQuery,
    gotoExtended,
    parseWithCheerio,
};
