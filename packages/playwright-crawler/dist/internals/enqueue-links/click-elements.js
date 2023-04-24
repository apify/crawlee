"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clickElements = exports.clickElementsAndInterceptNavigationRequests = exports.enqueueLinksByClickingElements = void 0;
const tslib_1 = require("tslib");
const browser_1 = require("@crawlee/browser");
const log_1 = tslib_1.__importDefault(require("@apify/log"));
const ow_1 = tslib_1.__importDefault(require("ow"));
const url_1 = require("url");
const STARTING_Z_INDEX = 2147400000;
const log = log_1.default.child({ prefix: 'Playwright Click Elements' });
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
 * await playwrightUtils.enqueueLinksByClickingElements({
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
 * @returns Promise that resolves to {@apilink BatchAddRequestsResult} object.
 */
async function enqueueLinksByClickingElements(options) {
    (0, ow_1.default)(options, ow_1.default.object.exactShape({
        page: ow_1.default.object.hasKeys('goto', 'evaluate'),
        requestQueue: ow_1.default.object.hasKeys('fetchNextRequest', 'addRequest'),
        selector: ow_1.default.string,
        userData: ow_1.default.optional.object,
        clickOptions: ow_1.default.optional.object.hasKeys('clickCount', 'delay'),
        pseudoUrls: ow_1.default.optional.array.ofType(ow_1.default.any(ow_1.default.string, ow_1.default.object.hasKeys('purl'))),
        globs: ow_1.default.optional.array.ofType(ow_1.default.any(ow_1.default.string, ow_1.default.object.hasKeys('glob'))),
        regexps: ow_1.default.optional.array.ofType(ow_1.default.any(ow_1.default.regExp, ow_1.default.object.hasKeys('regexp'))),
        transformRequestFunction: ow_1.default.optional.function,
        waitForPageIdleSecs: ow_1.default.optional.number,
        maxWaitForPageIdleSecs: ow_1.default.optional.number,
        label: ow_1.default.optional.string,
        forefront: ow_1.default.optional.boolean,
    }));
    const { page, requestQueue, selector, clickOptions, pseudoUrls, globs, regexps, transformRequestFunction, waitForPageIdleSecs = 1, maxWaitForPageIdleSecs = 5, forefront, } = options;
    const waitForPageIdleMillis = waitForPageIdleSecs * 1000;
    const maxWaitForPageIdleMillis = maxWaitForPageIdleSecs * 1000;
    const urlPatternObjects = [];
    if (pseudoUrls?.length) {
        log.deprecated('`pseudoUrls` option is deprecated, use `globs` or `regexps` instead');
        urlPatternObjects.push(...(0, browser_1.constructRegExpObjectsFromPseudoUrls)(pseudoUrls));
    }
    if (globs?.length) {
        urlPatternObjects.push(...(0, browser_1.constructGlobObjectsFromGlobs)(globs));
    }
    if (regexps?.length) {
        urlPatternObjects.push(...(0, browser_1.constructRegExpObjectsFromRegExps)(regexps));
    }
    const interceptedRequests = await clickElementsAndInterceptNavigationRequests({
        page,
        selector,
        waitForPageIdleMillis,
        maxWaitForPageIdleMillis,
        clickOptions,
    });
    let requestOptions = (0, browser_1.createRequestOptions)(interceptedRequests, options);
    if (transformRequestFunction) {
        requestOptions = requestOptions.map(transformRequestFunction).filter((r) => !!r);
    }
    const requests = (0, browser_1.createRequests)(requestOptions, urlPatternObjects);
    return requestQueue.addRequests(requests, { forefront });
}
exports.enqueueLinksByClickingElements = enqueueLinksByClickingElements;
/**
 * Clicks all elements of given page matching given selector.
 * Catches and intercepts all initiated navigation requests and opened pages.
 * Returns a list of all target URLs.
 * @ignore
 */
async function clickElementsAndInterceptNavigationRequests(options) {
    const { page, selector, waitForPageIdleMillis, maxWaitForPageIdleMillis, clickOptions, } = options;
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
    await context.unroute('*', onInterceptedRequest);
    const serializedRequests = Array.from(uniqueRequests);
    return serializedRequests.map((r) => JSON.parse(r));
}
exports.clickElementsAndInterceptNavigationRequests = clickElementsAndInterceptNavigationRequests;
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
            log.debug('enqueueLinksByClickingElements: Could not close spawned page.', { error: err.stack });
        }
    };
}
/**
 * @ignore
 */
function isTopFrameNavigationRequest(page, req) {
    return req.isNavigationRequest()
        && req.frame() === page.mainFrame();
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
async function clickElements(page, selector, clickOptions) {
    const elementHandles = await page.$$(selector);
    log.debug(`enqueueLinksByClickingElements: There are ${elementHandles.length} elements to click.`);
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
                log.warning(`An element with selector ${selector} that you're trying to click has been removed from the page. `
                    + 'This was probably caused by an earlier click which triggered some JavaScript on the page that caused it to change. '
                    + 'If you\'re trying to enqueue pagination links, we suggest using the "next" button, if available and going one by one.');
                shouldLogWarning = false;
            }
            log.debug('enqueueLinksByClickingElements: Click failed.', { stack: e.stack });
        }
    }
    log.debug(`enqueueLinksByClickingElements: Successfully clicked ${clickedElementsCount} elements out of ${elementHandles.length}`);
}
exports.clickElements = clickElements;
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
async function waitForPageIdle({ page, waitForPageIdleMillis, maxWaitForPageIdleMillis }) {
    return new Promise((resolve) => {
        let timeout;
        let maxTimeout;
        page.on('popup', activityHandler);
        function activityHandler() {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                clearTimeout(maxTimeout);
                finish();
            }, waitForPageIdleMillis);
        }
        function maxTimeoutHandler() {
            log.debug(`enqueueLinksByClickingElements: Page still showed activity after ${maxWaitForPageIdleMillis}ms. `
                + 'This is probably due to the website itself dispatching requests, but some links may also have been missed.');
            finish();
        }
        function finish() {
            page.off('request', activityHandler)
                .off('framenavigated', activityHandler)
                .off('popup', activityHandler);
            resolve();
        }
        maxTimeout = setTimeout(maxTimeoutHandler, maxWaitForPageIdleMillis);
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
            const url = new url_1.URL(stateUrl, page.url()).href;
            requests.add(JSON.stringify({ url }));
        }
        catch (err) {
            log.debug('enqueueLinksByClickingElements: Failed to ', { error: err.stack });
        }
    });
}
//# sourceMappingURL=click-elements.js.map