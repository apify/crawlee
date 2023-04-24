import type { GlobInput, PseudoUrlInput, RegExpInput, RequestTransform, RequestQueue } from '@crawlee/browser';
import type { Dictionary, BatchAddRequestsResult } from '@crawlee/types';
// @ts-ignore optional peer dependency
import type { Page } from 'playwright';
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
//# sourceMappingURL=click-elements.d.ts.map