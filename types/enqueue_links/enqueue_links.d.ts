/**
 * The function finds elements matching a specific CSS selector (HTML anchor (`<a>`) by default)
 * either in a Puppeteer page, or in a Cheerio object (parsed HTML),
 * and enqueues the URLs in their `href` attributes to the provided {@link RequestQueue}.
 * If you're looking to find URLs in JavaScript heavy pages where links are not available
 * in `href` elements, but rather navigations are triggered in click handlers
 * see {@link puppeteer#enqueueLinksByClickingElements}.
 *
 * Optionally, the function allows you to filter the target links' URLs using an array of {@link PseudoUrl} objects
 * and override settings of the enqueued {@link Request} objects.
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
 *       'https://www.example.com/handbags/[.*]',
 *       'https://www.example.com/purses/[.*]'
 *   ],
 * });
 * ```
 *
 * @param {Object} options
 *   All `enqueueLinks()` parameters are passed
 *   via an options object with the following keys:
 * @param {Page} [options.page]
 *   Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object.
 *   Either `page` or `$` option must be provided.
 * @param {CheerioStatic} [options.$]
 *   [`Cheerio`](https://github.com/cheeriojs/cheerio) function with loaded HTML.
 *   Either `page` or `$` option must be provided.
 * @param {RequestQueue} options.requestQueue
 *   A request queue to which the URLs will be enqueued.
 * @param {string} [options.selector='a']
 *   A CSS selector matching links to be enqueued.
 * @param {string} [options.baseUrl]
 *   A base URL that will be used to resolve relative URLs when using Cheerio. Ignored when using Puppeteer,
 *   since the relative URL resolution is done inside the browser automatically.
 * @param {Array<Object>|Array<string>} [options.pseudoUrls]
 *   An array of {@link PseudoUrl}s matching the URLs to be enqueued,
 *   or an array of strings or RegExps or plain Objects from which the {@link PseudoUrl}s can be constructed.
 *
 *   The plain objects must include at least the `purl` property, which holds the pseudo-URL string or RegExp.
 *   All remaining keys will be used as the `requestTemplate` argument of the {@link PseudoUrl} constructor,
 *   which lets you specify special properties for the enqueued {@link Request} objects.
 *
 *   If `pseudoUrls` is an empty array, `null` or `undefined`, then the function
 *   enqueues all links found on the page.
 * @param {RequestTransform} [options.transformRequestFunction]
 *   Just before a new {@link Request} is constructed and enqueued to the {@link RequestQueue}, this function can be used
 *   to remove it or modify its contents such as `userData`, `payload` or, most importantly `uniqueKey`. This is useful
 *   when you need to enqueue multiple `Requests` to the queue that share the same URL, but differ in methods or payloads,
 *   or to dynamically update or create `userData`.
 *
 *   For example: by adding `keepUrlFragment: true` to the `request` object, URL fragments will not be removed
 *   when `uniqueKey` is computed.
 *
 *   **Example:**
 *   ```javascript
 *   {
 *       transformRequestFunction: (request) => {
 *           request.userData.foo = 'bar';
 *           request.keepUrlFragment = true;
 *           return request;
 *       }
 *   }
 *   ```
 * @return {Promise<Array<QueueOperationInfo>>}
 *   Promise that resolves to an array of {@link QueueOperationInfo} objects.
 * @memberOf utils
 * @name enqueueLinks
 * @function
 */
export function enqueueLinks(options?: {
    page?: Page;
    $?: CheerioStatic;
    requestQueue: RequestQueue;
    selector?: string;
    baseUrl?: string;
    pseudoUrls?: string[] | Object[];
    transformRequestFunction?: RequestTransform;
}): Promise<QueueOperationInfo[]>;
/**
 * Extracts URLs from a given Puppeteer Page.
 *
 * @param {Page} page
 * @param {string} selector
 * @return {Promise<Array<string>>}
 * @ignore
 */
export function extractUrlsFromPage(page: Page, selector: string): Promise<string[]>;
/**
 * Extracts URLs from a given Cheerio object.
 *
 * @param {CheerioStatic} $
 * @param {string} selector
 * @param {string} baseUrl
 * @return {string[]}
 * @ignore
 */
export function extractUrlsFromCheerio($: CheerioStatic, selector: string, baseUrl: string): string[];
import { Page } from "puppeteer";
import { RequestQueue } from "../request_queue";
import { RequestTransform } from "./shared";
import { QueueOperationInfo } from "../request_queue";
