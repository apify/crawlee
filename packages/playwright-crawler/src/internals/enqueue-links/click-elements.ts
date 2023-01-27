import type {
    GlobInput,
    PseudoUrlInput,
    RegExpInput,
    RequestTransform,
    UrlPatternObject,
    RequestQueue,
    RequestOptions,
} from '@crawlee/browser';
import {
    constructGlobObjectsFromGlobs,
    constructRegExpObjectsFromPseudoUrls,
    constructRegExpObjectsFromRegExps,
    createRequests,
    createRequestOptions,
} from '@crawlee/browser';
import log_ from '@apify/log';
import type { Dictionary, BatchAddRequestsResult } from '@crawlee/types';
import ow from 'ow';
import type {
    Page,
    Frame,
    Request,
    Route,
} from 'playwright';
import { URL } from 'url';

const STARTING_Z_INDEX = 2147400000;
const log = log_.child({ prefix: 'Playwright Click Elements' });

type ClickOptions = Parameters<Page['click']>[1];

export interface EnqueueLinksByClickingElementsOptions {
    /**
     * Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
     */
    page: Page;

    /**
     * A request queue to which the URLs will be enqueued.
     */
    requestQueue: RequestQueue;

    /**
     * A CSS selector matching elements to be clicked on. Unlike in {@apilink enqueueLinks}, there is no default
     * value. This is to prevent suboptimal use of this function by using it too broadly.
     */
    selector: string;

    /** Sets {@apilink Request.userData} for newly enqueued requests. */
    userData?: Dictionary;

    /** Sets {@apilink Request.label} for newly enqueued requests. */
    label?: string;

    /**
     * Click options for use in Playwright click handler.
     */
    clickOptions?: ClickOptions;

    /**
     * An array of glob pattern strings or plain objects
     * containing glob pattern strings matching the URLs to be enqueued.
     *
     * The plain objects must include at least the `glob` property, which holds the glob pattern string.
     * All remaining keys will be used as request options for the corresponding enqueued {@apilink Request} objects.
     *
     * The matching is always case-insensitive.
     * If you need case-sensitive matching, use `regexps` property directly.
     *
     * If `globs` is an empty array or `undefined`, then the function
     * enqueues all the intercepted navigation requests produced by the page
     * after clicking on elements matching the provided CSS selector.
     */
    globs?: GlobInput[];

    /**
     * An array of regular expressions or plain objects
     * containing regular expressions matching the URLs to be enqueued.
     *
     * The plain objects must include at least the `regexp` property, which holds the regular expression.
     * All remaining keys will be used as request options for the corresponding enqueued {@apilink Request} objects.
     *
     * If `regexps` is an empty array or `undefined`, then the function
     * enqueues all the intercepted navigation requests produced by the page
     * after clicking on elements matching the provided CSS selector.
     */
    regexps?: RegExpInput[];

    /**
     * *NOTE:* In future versions of SDK the options will be removed.
     * Please use `globs` or `regexps` instead.
     *
     * An array of {@apilink PseudoUrl} strings or plain objects
     * containing {@apilink PseudoUrl} strings matching the URLs to be enqueued.
     *
     * The plain objects must include at least the `purl` property, which holds the pseudo-URL pattern string.
     * All remaining keys will be used as request options for the corresponding enqueued {@apilink Request} objects.
     *
     * With a pseudo-URL string, the matching is always case-insensitive.
     * If you need case-sensitive matching, use `regexps` property directly.
     *
     * If `pseudoUrls` is an empty array or `undefined`, then the function
     * enqueues all the intercepted navigation requests produced by the page
     * after clicking on elements matching the provided CSS selector.
     *
     * @deprecated prefer using `globs` or `regexps` instead
     */
    pseudoUrls?: PseudoUrlInput[];

    /**
     * Just before a new {@apilink Request} is constructed and enqueued to the {@apilink RequestQueue}, this function can be used
     * to remove it or modify its contents such as `userData`, `payload` or, most importantly `uniqueKey`. This is useful
     * when you need to enqueue multiple `Requests` to the queue that share the same URL, but differ in methods or payloads,
     * or to dynamically update or create `userData`.
     *
     * For example: by adding `useExtendedUniqueKey: true` to the `request` object, `uniqueKey` will be computed from
     * a combination of `url`, `method` and `payload` which enables crawling of websites that navigate using form submits
     * (POST requests).
     *
     * **Example:**
     * ```javascript
     * {
     *     transformRequestFunction: (request) => {
     *         request.userData.foo = 'bar';
     *         request.useExtendedUniqueKey = true;
     *         return request;
     *     }
     * }
     * ```
     */
    transformRequestFunction?: RequestTransform;

    /**
     * Clicking in the page triggers various asynchronous operations that lead to new URLs being shown
     * by the browser. It could be a simple JavaScript redirect or opening of a new tab in the browser.
     * These events often happen only some time after the actual click. Requests typically take milliseconds
     * while new tabs open in hundreds of milliseconds.
     *
     * To be able to capture all those events, the `enqueueLinksByClickingElements()` function repeatedly waits
     * for the `waitForPageIdleSecs`. By repeatedly we mean that whenever a relevant event is triggered, the timer
     * is restarted. As long as new events keep coming, the function will not return, unless
     * the below `maxWaitForPageIdleSecs` timeout is reached.
     *
     * You may want to reduce this for example when you're sure that your clicks do not open new tabs,
     * or increase when you're not getting all the expected URLs.
     * @default 1
     */
    waitForPageIdleSecs?: number;

    /**
     * This is the maximum period for which the function will keep tracking events, even if more events keep coming.
     * Its purpose is to prevent a deadlock in the page by periodic events, often unrelated to the clicking itself.
     * See `waitForPageIdleSecs` above for an explanation.
     * @default 5
     */
    maxWaitForPageIdleSecs?: number;

    /**
     * If set to `true`:
     *   - while adding the request to the queue: the request will be added to the foremost position in the queue.
     *   - while reclaiming the request: the request will be placed to the beginning of the queue, so that it's returned
     *   in the next call to {@apilink RequestQueue.fetchNextRequest}.
     * By default, it's put to the end of the queue.
     * @default false
     */
    forefront?: boolean;
}

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
export async function enqueueLinksByClickingElements(options: EnqueueLinksByClickingElementsOptions): Promise<BatchAddRequestsResult> {
    ow(options, ow.object.exactShape({
        page: ow.object.hasKeys('goto', 'evaluate'),
        requestQueue: ow.object.hasKeys('fetchNextRequest', 'addRequest'),
        selector: ow.string,
        userData: ow.optional.object,
        clickOptions: ow.optional.object.hasKeys('clickCount', 'delay'),
        pseudoUrls: ow.optional.array.ofType(ow.any(
            ow.string,
            ow.object.hasKeys('purl'),
        )),
        globs: ow.optional.array.ofType(ow.any(
            ow.string,
            ow.object.hasKeys('glob'),
        )),
        regexps: ow.optional.array.ofType(ow.any(
            ow.regExp,
            ow.object.hasKeys('regexp'),
        )),
        transformRequestFunction: ow.optional.function,
        waitForPageIdleSecs: ow.optional.number,
        maxWaitForPageIdleSecs: ow.optional.number,
        label: ow.optional.string,
        forefront: ow.optional.boolean,
    }));

    const {
        page,
        requestQueue,
        selector,
        clickOptions,
        pseudoUrls,
        globs,
        regexps,
        transformRequestFunction,
        waitForPageIdleSecs = 1,
        maxWaitForPageIdleSecs = 5,
        forefront,
    } = options;

    const waitForPageIdleMillis = waitForPageIdleSecs * 1000;
    const maxWaitForPageIdleMillis = maxWaitForPageIdleSecs * 1000;

    const urlPatternObjects: UrlPatternObject[] = [];

    if (pseudoUrls?.length) {
        log.deprecated('`pseudoUrls` option is deprecated, use `globs` or `regexps` instead');
        urlPatternObjects.push(...constructRegExpObjectsFromPseudoUrls(pseudoUrls));
    }

    if (globs?.length) {
        urlPatternObjects.push(...constructGlobObjectsFromGlobs(globs));
    }

    if (regexps?.length) {
        urlPatternObjects.push(...constructRegExpObjectsFromRegExps(regexps));
    }

    const interceptedRequests = await clickElementsAndInterceptNavigationRequests({
        page,
        selector,
        waitForPageIdleMillis,
        maxWaitForPageIdleMillis,
        clickOptions,
    });
    let requestOptions = createRequestOptions(interceptedRequests, options);
    if (transformRequestFunction) {
        requestOptions = requestOptions.map(transformRequestFunction).filter((r) => !!r) as RequestOptions[];
    }
    const requests = createRequests(requestOptions, urlPatternObjects);
    return requestQueue.addRequests(requests, { forefront });
}

interface WaitForPageIdleOptions {
    page: Page;
    waitForPageIdleMillis?: number;
    maxWaitForPageIdleMillis?: number;
}

interface ClickElementsAndInterceptNavigationRequestsOptions extends WaitForPageIdleOptions {
    selector: string;
    clickOptions?: ClickOptions;
}

/**
 * Clicks all elements of given page matching given selector.
 * Catches and intercepts all initiated navigation requests and opened pages.
 * Returns a list of all target URLs.
 * @ignore
 */
export async function clickElementsAndInterceptNavigationRequests(options: ClickElementsAndInterceptNavigationRequestsOptions): Promise<Dictionary[]> {
    const {
        page,
        selector,
        waitForPageIdleMillis,
        maxWaitForPageIdleMillis,
        clickOptions,
    } = options;

    const uniqueRequests = new Set<string>();
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

/**
 * @ignore
 */
function createInterceptRequestHandler(page: Page, requests: Set<string>): (route: Route, request: Request) => Promise<void> {
    return async function onInterceptedRequest(route, request) {
        if (!isTopFrameNavigationRequest(page, request)) return route.continue();
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
function createTargetCreatedHandler(requests: Set<string>): (popup: Page) => Promise<void> {
    return async function onTargetCreated(popup) {
        const url = popup.url();
        requests.add(JSON.stringify({ url }));

        // We want to close the page but don't care about
        // possible errors like target closed.
        try {
            await popup.close();
        } catch (err) {
            log.debug('enqueueLinksByClickingElements: Could not close spawned page.', { error: (err as Error).stack });
        }
    };
}

/**
 * @ignore
 */
function isTopFrameNavigationRequest(page: Page, req: Request): boolean {
    return req.isNavigationRequest()
        && req.frame() === page.mainFrame();
}

/**
 * @ignore
 */
function createFrameNavigatedHandler(page: Page, requests: Set<string>): (frame: Frame) => void {
    return function onFrameNavigated(frame) {
        if (frame !== page.mainFrame()) return;
        const url = frame.url();
        requests.add(JSON.stringify({ url }));
    };
}

interface ApifyWindow {
    stateHistory: unknown[][];
    length: number;
    state: Dictionary;
    go(): void;
    back(): void;
    forward(): void;
    pushState(...args: unknown[]): void;
    replaceState(...args: unknown[]): void;
}

/**
 * @ignore
 */
async function preventHistoryNavigation(page: Page): Promise<unknown> {
    /* istanbul ignore next */
    return page.evaluate(() => {
        (window as unknown as Dictionary).__originalHistory__ = window.history;
        delete (window as unknown as Dictionary).history; // Simple override does not work.
        (window as unknown as Dictionary).history = {
            stateHistory: [],
            length: 0,
            state: {},
            go() {},
            back() {},
            forward() {},
            pushState(...args: unknown[]) {
                this.stateHistory.push(args);
            },
            replaceState(...args: unknown[]) {
                this.stateHistory.push(args);
            },
        } as ApifyWindow;
    });
}

/* istanbul ignore next */
/**
 * In-browser script for updating element's CSS to make it reachable by mouse.
 */
function updateElementCssToEnableMouseClick(el: Element, zIndex: number): void {
    const casted = el as HTMLElement;
    casted.style.visibility = 'visible';
    casted.style.display = 'block';
    casted.style.position = 'fixed';
    casted.style.zIndex = String(zIndex);
    casted.style.left = '0';
    casted.style.top = '0';
    const boundingRect = casted.getBoundingClientRect();
    if (!boundingRect.height) casted.style.height = '10px';
    if (!boundingRect.width) casted.style.width = '10px';
}

/**
 * Click all elements matching the given selector. To be able to do this using
 * Playwright's `.click()` we need to make sure the elements are reachable by mouse,
 * so we first move them to the top of the page's stacking context and then click.
 * We do all in series to prevent elements from hiding one another. Therefore,
 * for large element sets, this will take considerable amount of time.
 * @ignore
 */
export async function clickElements(page: Page, selector: string, clickOptions?: ClickOptions): Promise<void> {
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
        } catch (err) {
            const e = err as Error;
            if (shouldLogWarning && e.stack!.includes('is detached from document')) {
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
async function waitForPageIdle({ page, waitForPageIdleMillis, maxWaitForPageIdleMillis }: WaitForPageIdleOptions): Promise<void> {
    return new Promise<void>((resolve) => {
        let timeout: NodeJS.Timeout;
        let maxTimeout: NodeJS.Timeout;

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
async function restoreHistoryNavigationAndSaveCapturedUrls(page: Page, requests: Set<string>): Promise<void> {
    /* istanbul ignore next */
    const state = await page.evaluate(() => {
        const { stateHistory } = window.history as unknown as ApifyWindow;
        (window as unknown as Dictionary).history = (window as unknown as Dictionary).__originalHistory__;
        return stateHistory;
    });

    state.forEach((args) => {
        try {
            const stateUrl = args[args.length - 1] as string;
            const url = new URL(stateUrl, page.url()).href;
            requests.add(JSON.stringify({ url }));
        } catch (err) {
            log.debug('enqueueLinksByClickingElements: Failed to ', { error: (err as Error).stack });
        }
    });
}
