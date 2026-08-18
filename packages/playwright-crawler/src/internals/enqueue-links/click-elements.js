import { URL } from 'node:url';
import { applyRequestTransform, constructUrlPatternObjects, createRequestOptions, filterRequestOptionsByPatterns, urlPatternSchema, Request as CrawleeRequest, serviceLocator, } from '@crawlee/browser';
import { parseArgument, schemas } from '@crawlee/utils/internal';
import { z } from 'zod';
const STARTING_Z_INDEX = 2147400000;
const getLog = () => serviceLocator.getChildLog('Playwright Click Elements');
const enqueueLinksByClickingElementsOptionsSchema = z.strictObject({
    page: schemas.objectWithKeys(['goto', 'evaluate']),
    requestManager: schemas.objectWithKeys(['fetchNextRequest', 'addRequestsBatched']),
    selector: z.string(),
    userData: schemas.anyObject.optional(),
    clickOptions: schemas.anyObject.optional(),
    include: schemas.arrayOf(urlPatternSchema, 'URL patterns').optional(),
    exclude: schemas.arrayOf(urlPatternSchema, 'URL patterns').optional(),
    transformRequestFunction: schemas.anyFunction.optional(),
    waitForPageIdleSecs: schemas.anyNumber.default(1),
    maxWaitForPageIdleSecs: schemas.anyNumber.default(5),
    label: z.string().optional(),
    forefront: z.boolean().optional(),
    skipNavigation: z.boolean().optional(),
    onSkippedRequest: schemas.anyFunction.optional(),
});
/**
 * The function finds elements matching a specific CSS selector in a Playwright page,
 * clicks all those elements using a mouse move and a left mouse button click and intercepts
 * all the navigation requests that are subsequently produced by the page. The intercepted
 * requests, including their methods, headers and payloads are then enqueued to a provided
 * {@apilink RequestQueue}. This is useful to crawl JavaScript heavy pages where links are not available
 * in `href` elements, but rather navigations are triggered in click handlers.
 * If you're looking to find URLs in `href` attributes of the page, see {@apilink enqueueLinks}.
 *
 * Optionally, the function allows you to filter the target links' URLs using an array of glob or regexp patterns.
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
 * await playwrightUtils.enqueueLinksByClickingElements({
 *   page,
 *   requestManager,
 *   selector: 'a.product-detail',
 *   include: [
 *       'https://www.example.com/handbags/*',
 *       'https://www.example.com/purses/*',
 *   ],
 * });
 * ```
 *
 * @returns Promise that resolves to {@apilink BatchAddRequestsResult} object.
 */
export async function enqueueLinksByClickingElements(options) {
    const parsedOptions = parseArgument(options, enqueueLinksByClickingElementsOptionsSchema, 'EnqueueLinksByClickingElementsOptions');
    const { page, requestManager, selector, clickOptions, include, exclude, transformRequestFunction, waitForPageIdleSecs, maxWaitForPageIdleSecs, forefront, onSkippedRequest, } = parsedOptions;
    const waitForPageIdleMillis = waitForPageIdleSecs * 1000;
    const maxWaitForPageIdleMillis = maxWaitForPageIdleSecs * 1000;
    const urlExcludePatternObjects = exclude?.length ? constructUrlPatternObjects(exclude) : [];
    const urlPatternObjects = include?.length ? constructUrlPatternObjects(include) : [];
    const interceptedRequests = await clickElementsAndInterceptNavigationRequests({
        page,
        selector,
        waitForPageIdleMillis,
        maxWaitForPageIdleMillis,
        clickOptions,
    });
    const requestOptions = createRequestOptions(interceptedRequests, parsedOptions);
    const skippedByFilters = [];
    let filteredOptions = filterRequestOptionsByPatterns(requestOptions, urlPatternObjects.length > 0 ? urlPatternObjects : undefined, urlExcludePatternObjects, undefined, (url) => skippedByFilters.push(url));
    if (onSkippedRequest && skippedByFilters.length > 0) {
        await Promise.all(skippedByFilters.map(async (url) => onSkippedRequest({ url, reason: 'filters' })));
    }
    if (transformRequestFunction) {
        const skippedByTransform = [];
        filteredOptions = applyRequestTransform(filteredOptions, transformRequestFunction, (r) => skippedByTransform.push(r));
        if (onSkippedRequest && skippedByTransform.length > 0) {
            await Promise.all(skippedByTransform.map(async (r) => onSkippedRequest({ url: r.url, reason: 'transform' })));
        }
    }
    const requests = filteredOptions.map((opts) => new CrawleeRequest(opts));
    const { addedRequests } = await requestManager.addRequestsBatched(requests, { forefront });
    return { processedRequests: addedRequests, unprocessedRequests: [] };
}
/**
 * Clicks all elements of given page matching given selector.
 * Catches and intercepts all initiated navigation requests and opened pages.
 * Returns a list of all target URLs.
 * @ignore
 */
export async function clickElementsAndInterceptNavigationRequests(options) {
    const { page, selector, waitForPageIdleMillis, maxWaitForPageIdleMillis, clickOptions } = options;
    const uniqueRequests = new Set();
    const context = page.context();
    const onInterceptedRequest = createInterceptRequestHandler(page, uniqueRequests);
    const onPopup = createTargetCreatedHandler(uniqueRequests);
    const onFrameNavigated = createFrameNavigatedHandler(page, uniqueRequests);
    await context.route('**', onInterceptedRequest);
    // context.on('BrowserEmittedEvents.TargetCreated', onTargetCreated);
    page.on('framenavigated', onFrameNavigated);
    page.on('popup', onPopup);
    await preventHistoryNavigation(page);
    await clickElements(page, selector, clickOptions);
    await waitForPageIdle({ page, waitForPageIdleMillis, maxWaitForPageIdleMillis });
    await restoreHistoryNavigationAndSaveCapturedUrls(page, uniqueRequests);
    // browser.off(BrowserEmittedEvents.TargetCreated, onTargetCreated);
    page.off('framenavigated', onFrameNavigated);
    await context.unroute('**', onInterceptedRequest);
    const serializedRequests = Array.from(uniqueRequests);
    return serializedRequests.map((r) => JSON.parse(r));
}
/**
 * @ignore
 */
function createInterceptRequestHandler(page, requests) {
    return async function onInterceptedRequest(route, request) {
        if (!isTopFrameNavigationRequest(page, request))
            return route.continue();
        requests.add(JSON.stringify({
            url: request.url(),
            headers: request.headers(),
            method: request.method(),
            payload: request.postData() ?? undefined,
        }));
        if (request.redirectedFrom()) {
            return route.fulfill({ body: '' }); // Prevents 301/302 redirect
        }
        return route.abort('aborted'); // Prevents navigation
    };
}
/**
 * @ignore
 */
function createTargetCreatedHandler(requests) {
    return async function onTargetCreated(popup) {
        const url = popup.url();
        requests.add(JSON.stringify({ url }));
        // We want to close the page but don't care about
        // possible errors like target closed.
        try {
            await popup.close();
        }
        catch (err) {
            getLog().debug('enqueueLinksByClickingElements: Could not close spawned page.', {
                error: err.stack,
            });
        }
    };
}
/**
 * @ignore
 */
function isTopFrameNavigationRequest(page, req) {
    try {
        return req.isNavigationRequest() && req.frame() === page.mainFrame();
    }
    catch {
        // `req.frame()` throws when the owning frame is unavailable - e.g. the request was
        // issued by a service worker, or before/after its frame existed (see #3216). Such a
        // request is not a top-frame navigation, so swallow the throw and let it pass through
        // instead of crashing the route handler (which would leave the route unhandled).
        return false;
    }
}
/**
 * @ignore
 */
function createFrameNavigatedHandler(page, requests) {
    return function onFrameNavigated(frame) {
        if (frame !== page.mainFrame())
            return;
        const url = frame.url();
        requests.add(JSON.stringify({ url }));
    };
}
/**
 * @ignore
 */
async function preventHistoryNavigation(page) {
    /* istanbul ignore next */
    return page.evaluate(() => {
        window.__originalHistory__ = window.history;
        delete window.history; // Simple override does not work.
        window.history = {
            stateHistory: [],
            length: 0,
            state: {},
            go() { },
            back() { },
            forward() { },
            pushState(...args) {
                this.stateHistory.push(args);
            },
            replaceState(...args) {
                this.stateHistory.push(args);
            },
        };
    });
}
/* istanbul ignore next */
/**
 * In-browser script for updating element's CSS to make it reachable by mouse.
 */
function updateElementCssToEnableMouseClick(el, zIndex) {
    const casted = el;
    casted.style.visibility = 'visible';
    casted.style.display = 'block';
    casted.style.position = 'fixed';
    casted.style.zIndex = String(zIndex);
    casted.style.left = '0';
    casted.style.top = '0';
    const boundingRect = casted.getBoundingClientRect();
    if (!boundingRect.height)
        casted.style.height = '10px';
    if (!boundingRect.width)
        casted.style.width = '10px';
}
/**
 * Click all elements matching the given selector. To be able to do this using
 * Playwright's `.click()` we need to make sure the elements are reachable by mouse,
 * so we first move them to the top of the page's stacking context and then click.
 * We do all in series to prevent elements from hiding one another. Therefore,
 * for large element sets, this will take considerable amount of time.
 * @ignore
 */
export async function clickElements(page, selector, clickOptions) {
    const elementHandles = await page.$$(selector);
    getLog().debug(`enqueueLinksByClickingElements: There are ${elementHandles.length} elements to click.`);
    let clickedElementsCount = 0;
    let zIndex = STARTING_Z_INDEX;
    let shouldLogWarning = true;
    for (const handle of elementHandles) {
        try {
            await handle.evaluate(updateElementCssToEnableMouseClick, zIndex++);
            await handle.click(clickOptions);
            clickedElementsCount++;
        }
        catch (err) {
            const e = err;
            if (shouldLogWarning && e.stack.includes('is detached from document')) {
                getLog().warning(`An element with selector ${selector} that you're trying to click has been removed from the page. ` +
                    'This was probably caused by an earlier click which triggered some JavaScript on the page that caused it to change. ' +
                    'If you\'re trying to enqueue pagination links, we suggest using the "next" button, if available and going one by one.');
                shouldLogWarning = false;
            }
            getLog().debug('enqueueLinksByClickingElements: Click failed.', { stack: e.stack });
        }
    }
    getLog().debug(`enqueueLinksByClickingElements: Successfully clicked ${clickedElementsCount} elements out of ${elementHandles.length}`);
}
/**
 * This function tracks whether any requests, frame navigations or targets were emitted
 * in the past idleIntervalMillis and whenever the interval registers no activity,
 * the function returns.
 *
 * It will also return when a final timeout, represented by the timeoutMillis parameter
 * is reached, to prevent blocking on pages with constant network activity.
 *
 * We need this to make sure we don't finish too soon when intercepting requests triggered
 * by clicking in the page. They often get registered by the Node.js process only some
 * milliseconds after clicking and we would lose those requests. This is especially prevalent
 * when there's only a single element to click.
 * @ignore
 */
async function waitForPageIdle({ page, waitForPageIdleMillis, maxWaitForPageIdleMillis, }) {
    return new Promise((resolve) => {
        let timeout;
        function activityHandler() {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                clearTimeout(maxTimeout);
                finish();
            }, waitForPageIdleMillis);
        }
        function maxTimeoutHandler() {
            getLog().debug(`enqueueLinksByClickingElements: Page still showed activity after ${maxWaitForPageIdleMillis}ms. ` +
                'This is probably due to the website itself dispatching requests, but some links may also have been missed.');
            finish();
        }
        function finish() {
            page.off('request', activityHandler).off('framenavigated', activityHandler).off('popup', activityHandler);
            resolve();
        }
        const maxTimeout = setTimeout(maxTimeoutHandler, maxWaitForPageIdleMillis);
        page.on('popup', activityHandler);
        activityHandler(); // We call this once manually in case there would be no requests at all.
        page.on('request', activityHandler);
        page.on('framenavigated', activityHandler);
    });
}
/**
 * @ignore
 */
async function restoreHistoryNavigationAndSaveCapturedUrls(page, requests) {
    /* istanbul ignore next */
    const state = await page.evaluate(() => {
        const { stateHistory } = window.history;
        window.history = window.__originalHistory__;
        return stateHistory;
    });
    state.forEach((args) => {
        try {
            const stateUrl = args[args.length - 1];
            const url = new URL(stateUrl, page.url()).href;
            requests.add(JSON.stringify({ url }));
        }
        catch (err) {
            getLog().debug('enqueueLinksByClickingElements: Failed to ', { error: err.stack });
        }
    });
}
