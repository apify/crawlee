import ow from 'ow';
import _ from 'underscore';
import { readFile } from 'fs/promises';
import { Page, Response } from 'playwright'; // eslint-disable-line no-unused-vars
import { LruCache } from '@apify/datastructures';
import log from './utils_log';
import { validators } from './validators';

/* eslint-disable no-unused-vars,import/named */
import { DirectNavigationOptions } from './typedefs';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

import Request from './request'; // eslint-disable-line no-unused-vars

const jqueryPath = require.resolve('jquery');

const MAX_INJECT_FILE_CACHE_SIZE = 10;

/**
 * Cache contents of previously injected files to limit file system access.
 */
const injectedFilesCache = new LruCache({ maxLength: MAX_INJECT_FILE_CACHE_SIZE });

/**
 * Injects a JavaScript file into a Playright page.
 * Unlike Playwright's `addScriptTag` function, this function works on pages
 * with arbitrary Cross-Origin Resource Sharing (CORS) policies.
 *
 * File contents are cached for up to 10 files to limit file system access.
 *
 * @param {Page} page
 *   Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param {string} filePath File path
 * @param {object} [options]
 * @param {boolean} [options.surviveNavigations]
 *   Enables the injected script to survive page navigations and reloads without need to be re-injected manually.
 *   This does not mean, however, that internal state will be preserved. Just that it will be automatically
 *   re-injected on each navigation before any other scripts get the chance to execute.
 * @return {Promise<*>}
 * @memberOf playwright
 */
const injectFile = async (page, filePath, options = {}) => {
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
                .catch((error) => log.warning('An error occured during the script injection!', { error })));
    }

    return evalP;
};

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
 * await Apify.utils.playwright.injectJQuery(page);
 * const title = await page.evaluate(() => {
 *   return $('head title').text();
 * });
 * ```
 *
 * Note that `injectJQuery()` does not affect the Playwright
 * [`page.$()`](https://playwright.dev/docs/api/class-page#page-query-selector)
 * function in any way.
 *
 * @param {Page} page
 *   Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @return {Promise<*>}
 * @memberOf playwright
 */
const injectJQuery = (page) => {
    ow(page, ow.object.validate(validators.browserPage));
    return injectFile(page, jqueryPath, { surviveNavigations: true });
};

/**
 * Extended version of Playwright's `page.goto()` allowing to perform requests with HTTP method other than GET,
 * with custom headers and POST payload. URL, method, headers and payload are taken from
 * request parameter that must be an instance of Apify.Request class.
 *
 * *NOTE:* In recent versions of Playwright using requests other than GET, overriding headers and adding payloads disables
 * browser cache which degrades performance.
 *
 * @param {Page} page
 *   Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param {Request} request
 * @param {DirectNavigationOptions} [gotoOptions] Custom options for `page.goto()`.
 * @return {Promise<(Response|null)>}
 *
 * @memberOf playwright
 * @name gotoExtended
 */
export const gotoExtended = async (page, request, gotoOptions = {}) => {
    ow(page, ow.object.validate(validators.browserPage));
    ow(request, ow.object.partialShape({
        url: ow.string.url,
        method: ow.optional.string,
        headers: ow.optional.object,
        payload: ow.optional.any(ow.string, ow.buffer),
    }));
    ow(gotoOptions, ow.object);

    const { url, method, headers, payload } = request;

    if (method !== 'GET' || payload || !_.isEmpty(headers)) {
        // This is not deprecated, we use it to log only once.
        log.deprecated('Using other request methods than GET, rewriting headers and adding payloads has a high impact on performance '
            + 'in recent versions of Playwright. Use only when necessary.');
        let wasCalled = false;
        const interceptRequestHandler = async (route) => {
            try {
                // We want to ensure that this won't get executed again in a case that there is a subsequent request
                // for example for some asset file link from main HTML.
                if (wasCalled) {
                    return await route.continue();
                }

                wasCalled = true;
                const overrides = {};

                if (method !== 'GET') overrides.method = method;
                if (payload) overrides.postData = payload;
                if (!_.isEmpty(headers)) overrides.headers = headers;
                await route.continue(overrides);
            } catch (error) {
                log.debug('Error inside request interceptor', { error });
            }
        };

        await page.route('**/*', interceptRequestHandler);
    }

    return page.goto(url, gotoOptions);
};

/**
 * A namespace that contains various utilities for
 * [Playwright](https://github.com/microsoft/playwright) - the headless Chrome Node API.
 *
 * **Example usage:**
 *
 * ```javascript
 * const Apify = require('apify');
 * const { playwright } = Apify.utils;
 *
 * // Navigate to https://www.example.com in Playwright with a POST request
 * const browser = await Apify.launchPlaywright();
 * const page = await browser.newPage();
 * await playwright.gotoExtended(page, {
 *     url: 'https://example.com,
 *     method: 'POST',
 * });
 * ```
 * @namespace playwright
 */
export const playwrightUtils = {
    gotoExtended,
    injectFile,
    injectJQuery,
};
