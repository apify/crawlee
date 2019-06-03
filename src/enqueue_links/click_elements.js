import { checkParamOrThrow } from 'apify-client/build/utils';
import { checkParamPrototypeOrThrow } from 'apify-shared/utilities';
import log from 'apify-shared/log';
import { RequestQueue, RequestQueueLocal } from '../request_queue';
import { addInterceptRequestHandler, removeInterceptRequestHandler } from '../puppeteer_request_interception';
import { constructPseudoUrlInstances, createRequests, addRequestsToQueueInBatches } from './shared';

const STARTING_Z_INDEX = 10000;

/**
 * The function finds elements matching a specific CSS selector in a Puppeteer page,
 * clicks all those elements using a mouse move and a left mouse button click and intercepts
 * all the navigation requests that are subsequently produced by the page. The intercepted
 * requests, including their methods, headers and payloads are then enqueued to a provided
 * {@link RequestQueue}. This is useful to crawl JavaScript heavy pages where links are not available
 * in `href` elements, but rather navigations are triggered in click handlers.
 * If you're looking to find URLs in `href` attributes of the page, see [`enqueueLinks()`](utils#utils.enqueueLinks).
 *
 * Optionally, the function allows you to filter the target links' URLs using an array of {@link PseudoUrl} objects
 * and override settings of the enqueued {@link Request} objects.
 *
 * *IMPORTANT*: To be able to do this, this function uses various mutations on the page,
 * such as changing the Z-index of elements being clicked and their visibility. Therefore,
 * it is recommended to only use this function as the last operation in the page.
 *
 * *PERFORMANCE*: Clicking elements with a mouse and intercepting requests is not a low level operation
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
 *
 * @param {Object} options
 *   All `enqueueLinksByClickingElements()` parameters are passed
 *   via an options object with the following keys:
 * @param {Page} options.page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 * @param {RequestQueue} options.requestQueue
 *   A request queue to which the URLs will be enqueued.
 * @param {String} options.selector
 *   A CSS selector matching elements to be clicked on. Unlike in [`enqueueLinks()`](utils#utils.enqueueLinks), there is no default
 *   value. This is to prevent suboptimal use of this function by using it too broadly.
 * @param {Object[]|String[]} [options.pseudoUrls]
 *   An array of {@link PseudoUrl}s matching the URLs to be enqueued,
 *   or an array of strings or RegExps or plain Objects from which the {@link PseudoUrl}s can be constructed.
 *
 *   The plain objects must include at least the `purl` property, which holds the pseudo-URL string or RegExp.
 *   All remaining keys will be used as the `requestTemplate` argument of the {@link PseudoUrl} constructor,
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
 * @memberOf puppeteer
 * @name enqueueLinksByClickingElements
 */
export async function enqueueLinksByClickingElements(options = {}) {
    const {
        page,
        requestQueue,
        selector,
        pseudoUrls,
        userData = {},
    } = options;

    checkParamOrThrow(page, 'page', 'Object');
    checkParamOrThrow(selector, 'selector', 'String');
    checkParamPrototypeOrThrow(requestQueue, 'requestQueue', [RequestQueue, RequestQueueLocal], 'Apify.RequestQueue');
    checkParamOrThrow(pseudoUrls, 'pseudoUrls', 'Maybe Array');
    checkParamOrThrow(userData, 'userData', 'Object');

    const pseudoUrlInstances = constructPseudoUrlInstances(pseudoUrls || []);
    const interceptedRequests = await clickElementsAndInterceptNavigationRequests(page, selector);
    const requests = createRequests(interceptedRequests, pseudoUrlInstances, userData);
    return addRequestsToQueueInBatches(requests, requestQueue);
}

/**
 * Clicks all elements of given page matching given selector.
 * Catches and intercepts all initiated navigation requests and opened pages.
 * Returns a list of all target URLs.
 *
 * @param {Page} page
 * @param {string} selector
 * @return {Promise<Object[]>}
 * @ignore
 */
async function clickElementsAndInterceptNavigationRequests(page, selector) {
    const uniqueRequests = new Map();
    const browser = page.browser();

    const onInterceptedRequest = createInterceptRequestHandler(page, uniqueRequests);
    const onTargetCreated = createTargetCreatedHandler(page, uniqueRequests);

    await addInterceptRequestHandler(page, onInterceptedRequest);
    browser.on('targetcreated', onTargetCreated);

    await clickElements(page, selector);

    browser.removeListener('targetcreated', onTargetCreated);
    await removeInterceptRequestHandler(page, onInterceptedRequest);

    return Array.from(uniqueRequests.values());
}

/**
 * @param {Page} page
 * @param {Map} requests
 * @return {Function}
 */
function createInterceptRequestHandler(page, requests) {
    return function onInterceptedRequest(req) {
        if (!isTopFrameNavigationRequest(page, req)) return req.continue();
        const url = req.url();
        requests.set(url, {
            url,
            headers: req.headers(),
            method: req.method(),
            payload: req.postData(),
        });
        req.respond(req.redirectChain().length
            ? { body: '' } // Prevents 301/302 redirect
            : { status: 204 }); // Prevents navigation by js
    };
}

/**
 * @param {Page} page
 * @param {Request} req
 * @return {boolean}
 */
function isTopFrameNavigationRequest(page, req) {
    return req.isNavigationRequest()
        && req.frame() === page.mainFrame()
        && req.url() !== page.url();
}

/**
 * @param {Page} page
 * @param {Map} requests
 * @return {Function}
 */
function createTargetCreatedHandler(page, requests) {
    return async function onTargetCreated(target) {
        if (target.type() !== 'page') return;
        if (page.target() !== target.opener()) return;
        const newPage = await target.page();
        const url = newPage.url();
        requests.set(url, { url });
        page.close().catch((err) => {
            log.debug('enqueueLinksByClickingElements: Could not close spawned page.', { stack: err.stack });
        });
    };
}

/**
 * Click all elements matching the given selector. To be able to do this using
 * Puppeteer's `.click()` we need to make sure the elements are reachable by mouse,
 * so we first move them to the top of the page's stacking context and then click.
 * We do all in series to prevent elements from hiding one another. Therefore,
 * for large element sets, this will take considerable amount of time.
 *
 * @param {Page} page
 * @param {string} selector
 * @return {Promise}
 */
async function clickElements(page, selector) {
    const elementHandles = await page.$$(selector);
    log.debug(`enqueueLinksByClickingElements: There are ${elementHandles.length} elements to click.`);
    let clickedElementsCount = 0;
    let zIndex = STARTING_Z_INDEX;
    for (const handle of elementHandles) {
        try {
            await page.evaluate((el, zIndex) => { // eslint-disable-line no-shadow
                el.style.visiblity = 'visible';
                el.style.display = 'block';
                el.style.position = 'absolute';
                el.style.zindex = zIndex;
            }, handle, zIndex++);
            await handle.click();
            clickedElementsCount++;
        } catch (err) {
            log.debug('enqueueLinksByClickingElements: Click failed.', { stack: err.stack });
        }
    }
    log.debug(`enqueueLinksByClickingElements: Successfully clicked ${clickedElementsCount} elements out of ${elementHandles.length}`);
}
