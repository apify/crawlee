import { URL } from 'url';
import _ from 'underscore';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { checkParamPrototypeOrThrow } from 'apify-shared/utilities';
import { RequestQueue, RequestQueueLocal } from './request_queue';
import Request from './request';
import PseudoUrl from './pseudo_url';

/**
 * To enable direct use of the Actor UI `pseudoUrls` output while keeping high performance,
 * all the pseudoUrls from the output are only constructed once and kept in a cache
 * by the `enqueueLinks()` function.
 * @ignore
 */
const enqueueLinksCache = new Map();
export const MAX_ENQUEUE_LINKS_CACHE_SIZE = 1000;

/**
 * Helper factory used in the `enqueueLinks()` function.
 * @param {string[]|Object[]} pseudoUrls
 * @returns {Array}
 * @ignore
 */
export const constructPseudoUrlInstances = (pseudoUrls) => {
    return pseudoUrls.map((item, idx) => {
        // Get pseudoUrl instance from cache.
        let pUrl = enqueueLinksCache.get(item);
        if (pUrl) return pUrl;
        // Nothing in cache, make a new instance.
        checkParamOrThrow(item, `pseudoUrls[${idx}]`, 'RegExp|Object|String');

        // If it's already a PseudoURL, just save it.
        if (item instanceof PseudoUrl) pUrl = item;
        // If it's a string or RegExp, construct a PURL from it directly.
        else if (typeof item === 'string' || item instanceof RegExp) pUrl = new PseudoUrl(item);
        // If it's an object, look for a purl property and use it and the rest to construct a PURL with a Request template.
        else pUrl = new PseudoUrl(item.purl, _.omit(item, 'purl'));

        // Manage cache
        enqueueLinksCache.set(item, pUrl);
        if (enqueueLinksCache.size > MAX_ENQUEUE_LINKS_CACHE_SIZE) {
            const key = enqueueLinksCache.keys().next().value;
            enqueueLinksCache.delete(key);
        }
        return pUrl;
    });
};

/**
 * Extracts URLs from a given Puppeteer Page.
 *
 * @param {Page} page
 * @param {string} selector
 * @returns {string[]}
 * @ignore
 */
export const extractUrlsFromPage = async (page, selector) => {
    /* istanbul ignore next */
    return page.$$eval(selector, linkEls => linkEls.map(link => link.href).filter(href => !!href));
};

/**
 * Extracts URLs from a given Cheerio object.
 *
 * @param {Function} $
 * @param {string} selector
 * @param {string} baseUrl
 * @returns {string[]}
 * @ignore
 */
export const extraxtUrlsFromCheerio = ($, selector, baseUrl) => {
    return $(selector)
        .map((i, el) => $(el).attr('href'))
        .get()
        .filter(href => href)
        .map((href) => {
            // Throw a meaningful error when only a relative URL would be extracted instead of waiting for the Request to fail later.
            const isHrefAbsolute = /^[a-z][a-z0-9+.-]*:/.test(href); // Grabbed this in 'is-absolute-url' package.
            if (!isHrefAbsolute && !baseUrl) {
                throw new Error(`An extracted URL: ${href} is relative and options.baseUrl is not set. `
                    + 'Use options.baseUrl in utils.enqueueLinks() to automatically resolve relative URLs.');
            }
            return baseUrl
                ? (new URL(href, baseUrl)).href
                : href;
        });
};

/**
 * Remove with 1.0.0
 * @ignore
 * @todo deprecate
 */
let logDeprecationWarning = true;

/**
 * The function finds elements matching a specific CSS selector (HTML anchor (`<a>`) by default)
 * either in a Puppeteer page, or in a Cheerio object (parsed HTML),
 * and enqueues the corresponding links to the provided {@link RequestQueue}.
 * Optionally, the function allows you to filter the target links' URLs using an array of {@link PseudoUrl} objects
 * and override settings of the enqueued {@link Request} objects.
 *
 * *IMPORTANT*: This is a work in progress. Currently the function only supports elements with
 * `href` attribute pointing to a URL. However, in the future the function will also support
 * JavaScript links, buttons and form submissions when used with a Puppeteer Page.
 *
 * **Example usage**
 *
 * ```javascript
 * const Apify = require('apify');
 *
 * const browser = await Apify.launchPuppeteer();
 * const page = await browser.goto('https://www.example.com');
 * const requestQueue = await Apify.openRequestQueue();
 *
 * await Apify.utils.enqueueLinks({
 *   page,
 *   requestQueue,
 *   selector: 'a.product-detail',
 *   pseudoUrls: [
 *       'https://www.example.com/handbags/[.*]'
 *       'https://www.example.com/purses/[.*]'
 *   ],
 * });
 * ```
 *
 * @param {Object} options
 *   All `enqueueLinks()` parameters are passed
 *   via an options object with the following keys:
 * @param {Page} options.page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 *   Either `page` or `$` option must be provided.
 * @param {Cheerio} options.$
 *   <a href="https://github.com/cheeriojs/cheerio" target="_blank"><code>Cheerio</code></a> object with loaded HTML.
 *   Either `page` or `$` option must be provided.
 * @param {RequestQueue} options.requestQueue
 *   A request queue to which the URLs will be enqueued.
 * @param {String} [options.selector='a']
 *   A CSS selector matching links to be enqueued.
 * @param {string} [options.baseUrl]
 *   A base URL that will be used to resolve relative URLs when using Cheerio. Ignored when using Puppeteer,
 *   since the relative URL resolution is done inside the browser automatically.
 * @param {Object[]|String[]} [options.pseudoUrls]
 *   An array of {@link PseudoUrl}s matching the URLs to be enqueued,
 *   or an array of strings or RegExps or plain Objects from which the {@link PseudoUrl}s can be constructed.
 *
 *   The plain objects must include at least the `purl` property, which holds the pseudo-URL string or RegExp.
 *   All remaining keys will be used as the `requestTemplate` argument of the {@link PseudoUrl} constructor.
 *   which lets you specify special properties for the enqueued {@link Request} objects.
 *
 *   If `pseudoUrls` is an empty array, `null` or `undefined`, then the function
 *   enqueues all links found on the page.
 * @param {Object} [options.userData]
 *   An object that will be merged with the new {@link Request}'s `userData`, overriding any values that
 *   were set via templating from `pseudoUrls`. This is useful when you need to override generic
 *   `userData` set by the {@link PseudoUrl} template in specific use cases.
 *
 *   **Example:**
 * ```
 * // pseudoUrl.userData
 * {
 *     name: 'John',
 *     surname: 'Doe',
 * }
 * ```
 * ```
 * // userData
 * {
 *     name: 'Albert',
 *     age: 31
 * }
 * ```
 * ```
 * // Enqueued request.userData
 * {
 *     name: 'Albert',
 *     surname: 'Doe',
 *     age: 31,
 * }
 * ```
 * @return {Promise<QueueOperationInfo[]>}
 *   Promise that resolves to an array of {@link QueueOperationInfo} objects.
 * @memberOf utils
 * @name enqueueLinks
 */
export const enqueueLinks = async (...args) => {
    // TODO: Remove after v1.0.0 gets released.
    // Refactor enqueueLinks to use an options object and keep backwards compatibility
    let page, $, selector, requestQueue, baseUrl, pseudoUrls, userData; // eslint-disable-line
    if (args.length === 1) {
        [{ page, $, selector = 'a', requestQueue, baseUrl, pseudoUrls, userData = {} }] = args;
    } else {
        [page, selector = 'a', requestQueue, pseudoUrls, userData = {}] = args;
        if (logDeprecationWarning) {
            log.warning('Passing individual arguments to enqueueLinks() is deprecated. '
                + 'Use an options object: enqueueLinks({ page, selector, requestQueue, pseudoUrls, userData }) instead.');
            logDeprecationWarning = false;
        }
    }

    // Check for pseudoUrls as a third parameter.
    if (Array.isArray(requestQueue)) {
        const tmp = requestQueue;
        requestQueue = pseudoUrls;
        pseudoUrls = tmp;
    }

    checkParamOrThrow(page, 'page', 'Maybe Object');
    checkParamOrThrow($, '$', 'Maybe Function');
    if (!page && !$) {
        throw new Error('One of the parameters "options.page" or "options.$" must be provided!');
    }
    if (page && $) {
        throw new Error('Only one of the parameters "options.page" or "options.$" must be provided!');
    }
    checkParamOrThrow(selector, 'selector', 'String');
    checkParamPrototypeOrThrow(requestQueue, 'requestQueue', [RequestQueue, RequestQueueLocal], 'Apify.RequestQueue');
    checkParamOrThrow(baseUrl, 'baseUrl', 'Maybe String');
    if (baseUrl && page) log.warning('The parameter options.baseUrl can only be used when parsing a Cheerio object. It will be ignored.');
    checkParamOrThrow(pseudoUrls, 'pseudoUrls', 'Maybe Array');
    checkParamOrThrow(userData, 'userData', 'Maybe Object');

    // Construct pseudoUrls from input where necessary.
    const pseudoUrlInstances = constructPseudoUrlInstances(pseudoUrls || []);

    const urls = page ? await extractUrlsFromPage(page, selector) : extraxtUrlsFromCheerio($, selector, baseUrl);
    let requests = [];

    if (pseudoUrlInstances.length) {
        urls.forEach((url) => {
            pseudoUrlInstances
                .filter(purl => purl.matches(url))
                .forEach(purl => requests.push(purl.createRequest(url)));
        });
    } else {
        requests = urls.map(url => new Request({ url }));
    }

    const queueOperationInfos = [];
    for (const request of requests) {
        // Inject custom userData
        Object.assign(request.userData, userData);
        queueOperationInfos.push(await requestQueue.addRequest(request));
    }
    return queueOperationInfos;
};
