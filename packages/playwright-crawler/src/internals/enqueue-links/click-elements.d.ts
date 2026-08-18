import type { IRequestManager, RequestTransform, SkippedRequestCallback, UrlPatternInput } from '@crawlee/browser';
import type { BatchAddRequestsResult, Dictionary } from '@crawlee/types';
import type { Page } from 'playwright';
type ClickOptions = Parameters<Page['click']>[1];
export interface EnqueueLinksByClickingElementsOptions {
    /**
     * Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
     */
    page: Page;
    /**
     * * A request manager to which the URLs will be enqueued.
     */
    requestManager: IRequestManager;
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
     * An array of URL patterns that URLs must match to be enqueued.
     *
     * Accepts glob pattern strings, `{ glob: string }` objects, `RegExp` instances, or `{ regexp: RegExp }` objects.
     *
     * Glob matching is always case-insensitive.
     * If you need case-sensitive matching, use a `RegExp`.
     *
     * If `include` is an empty array or `undefined`, then the function
     * enqueues all the intercepted navigation requests produced by the page
     * after clicking on elements matching the provided CSS selector.
     */
    include?: UrlPatternInput[];
    /**
     * An array of URL patterns. Matching URLs will **not** be enqueued.
     *
     * Accepts glob pattern strings, `{ glob: string }` objects, `RegExp` instances, or `{ regexp: RegExp }` objects.
     *
     * Glob matching is always case-insensitive.
     * If you need case-sensitive matching, use a `RegExp`.
     */
    exclude?: readonly UrlPatternInput[];
    /**
     * After request options are filtered by `include`/`exclude` patterns,
     * this function can be used to remove them or modify their contents such as `userData`, `payload` or, most importantly
     * `uniqueKey`. This is useful when you need to enqueue multiple `Requests` to the queue that share the same URL,
     * but differ in methods or payloads, or to dynamically update or create `userData`.
     *
     * **Example:**
     * ```javascript
     * {
     *     transformRequestFunction: (request) => {
     *         request.userData.foo = 'bar';
     *         return request;
     *     }
     * }
     * ```
     *
     * Note that `transformRequestFunction` has the highest priority and can overwrite
     * the global `label` option.
     *
     * The function receives a {@apilink RequestOptions} object and can return either:
     * - The modified {@apilink RequestOptions} object
     * - `'unchanged'` to keep the original options as-is
     * - A falsy value or `'skip'` to exclude the request from the queue
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
    /**
     * If set to `true`, tells the crawler to skip navigation and process the request directly.
     * @default false
     */
    skipNavigation?: boolean;
    /**
     * When a request is skipped for some reason, you can use this callback to act on it.
     * This is fired for requests skipped because they don't match enqueueLinks filters
     * or because they were removed by `transformRequestFunction`.
     */
    onSkippedRequest?: SkippedRequestCallback;
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
export declare function enqueueLinksByClickingElements(options: EnqueueLinksByClickingElementsOptions): Promise<BatchAddRequestsResult>;
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
export declare function clickElementsAndInterceptNavigationRequests(options: ClickElementsAndInterceptNavigationRequestsOptions): Promise<Dictionary[]>;
/**
 * Click all elements matching the given selector. To be able to do this using
 * Playwright's `.click()` we need to make sure the elements are reachable by mouse,
 * so we first move them to the top of the page's stacking context and then click.
 * We do all in series to prevent elements from hiding one another. Therefore,
 * for large element sets, this will take considerable amount of time.
 * @ignore
 */
export declare function clickElements(page: Page, selector: string, clickOptions?: ClickOptions): Promise<void>;
export {};
