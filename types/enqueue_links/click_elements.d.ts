/**
 * The function finds elements matching a specific CSS selector in a Puppeteer page,
 * clicks all those elements using a mouse move and a left mouse button click and intercepts
 * all the navigation requests that are subsequently produced by the page. The intercepted
 * requests, including their methods, headers and payloads are then enqueued to a provided
 * {@link RequestQueue}. This is useful to crawl JavaScript heavy pages where links are not available
 * in `href` elements, but rather navigations are triggered in click handlers.
 * If you're looking to find URLs in `href` attributes of the page, see {@link utils#enqueueLinks}.
 *
 * Optionally, the function allows you to filter the target links' URLs using an array of {@link PseudoUrl} objects
 * and override settings of the enqueued {@link Request} objects.
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
 * const Apify = require('apify');
 *
 * const browser = await Apify.launchPuppeteer();
 * const page = await browser.goto('https://www.example.com');
 * const requestQueue = await Apify.openRequestQueue();
 *
 * await Apify.utils.enqueueLinksByClickingElements({
 *   page,
 *   requestQueue,
 *   selector: 'a.product-detail',
 *   pseudoUrls: [
 *       'https://www.example.com/handbags/[.*]'
 *       'https://www.example.com/purses/[.*]'
 *   ],
 * });
 * ```
 * @param {Object} options
 *   All `enqueueLinksByClickingElements()` parameters are passed
 *   via an options object with the following keys:
 * @param {Page} options.page
 *   Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object.
 * @param {RequestQueue} options.requestQueue
 *   A request queue to which the URLs will be enqueued.
 * @param {string} options.selector
 *   A CSS selector matching elements to be clicked on. Unlike in {@link utils#enqueueLinks}, there is no default
 *   value. This is to prevent suboptimal use of this function by using it too broadly.
 * @param {Array<(string|RegExp|Object)>} [options.pseudoUrls]
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
 *   For example: by adding `useExtendedUniqueKey: true` to the `request` object, `uniqueKey` will be computed from
 *   a combination of `url`, `method` and `payload` which enables crawling of websites that navigate using form submits
 *   (POST requests).
 *
 *   **Example:**
 *   ```javascript
 *   {
 *       transformRequestFunction: (request) => {
 *           request.userData.foo = 'bar';
 *           request.useExtendedUniqueKey = true;
 *           return request;
 *       }
 *   }
 *   ```
 * @param {number} [options.waitForPageIdleSecs=1]
 *   Clicking in the page triggers various asynchronous operations that lead to new URLs being shown
 *   by the browser. It could be a simple JavaScript redirect or opening of a new tab in the browser.
 *   These events often happen only some time after the actual click. Requests typically take milliseconds
 *   while new tabs open in hundreds of milliseconds.
 *
 *   To be able to capture all those events, the `enqueueLinksByClickingElements()` function repeatedly waits
 *   for the `waitForPageIdleSecs`. By repeatedly we mean that whenever a relevant event is triggered, the timer
 *   is restarted. As long as new events keep coming, the function will not return, unless
 *   the below `maxWaitForPageIdleSecs` timeout is reached.
 *
 *   You may want to reduce this for example when you're sure that your clicks do not open new tabs,
 *   or increase when you're not getting all the expected URLs.
 * @param {number} [options.maxWaitForPageIdleSecs=5]
 *   This is the maximum period for which the function will keep tracking events, even if more events keep coming.
 *   Its purpose is to prevent a deadlock in the page by periodic events, often unrelated to the clicking itself.
 *   See `waitForPageIdleSecs` above for an explanation.
 * @return {Promise<Array<QueueOperationInfo>>}
 *   Promise that resolves to an array of {@link QueueOperationInfo} objects.
 * @memberOf puppeteer
 * @name enqueueLinksByClickingElements
 * @function
 */
export function enqueueLinksByClickingElements(options?: {
    page: Page;
    requestQueue: RequestQueue;
    selector: string;
    pseudoUrls?: (string | Object | RegExp)[];
    transformRequestFunction?: RequestTransform;
    waitForPageIdleSecs?: number;
    maxWaitForPageIdleSecs?: number;
}): Promise<QueueOperationInfo[]>;
/**
 * Clicks all elements of given page matching given selector.
 * Catches and intercepts all initiated navigation requests and opened pages.
 * Returns a list of all target URLs.
 *
 * @param {Object} options
 * @param {Page} options.page
 * @param {string} options.selector
 * @return {Promise<Array<object>>}
 * @ignore
 */
export function clickElementsAndInterceptNavigationRequests(options: {
    page: Page;
    selector: string;
}): Promise<any[]>;
/**
 * We're only interested in pages created by the page we're currently clicking in.
 * There will generally be a lot of other targets being created in the browser.
 * @param {Page} page
 * @param {Target} target
 * @return {boolean}
 */
export function isTargetRelevant(page: Page, target: Target): boolean;
/**
 * Click all elements matching the given selector. To be able to do this using
 * Puppeteer's `.click()` we need to make sure the elements are reachable by mouse,
 * so we first move them to the top of the page's stacking context and then click.
 * We do all in series to prevent elements from hiding one another. Therefore,
 * for large element sets, this will take considerable amount of time.
 *
 * @param {Page} page
 * @param {string} selector
 * @return {Promise<void>}
 * @ignore
 */
export function clickElements(page: Page, selector: string): Promise<void>;
import { Page } from "puppeteer";
import { RequestQueue } from "../request_queue";
import { RequestTransform } from "./shared";
import { QueueOperationInfo } from "../request_queue";
import { Target } from "puppeteer";
