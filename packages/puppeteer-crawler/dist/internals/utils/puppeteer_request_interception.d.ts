// @ts-ignore optional peer dependency
import type { HTTPRequest as PuppeteerRequest, Page } from 'puppeteer';
export type InterceptHandler = (request: PuppeteerRequest) => unknown;
/**
 * Adds request interception handler in similar to `page.on('request', handler);` but in addition to that
 * supports multiple parallel handlers.
 *
 * All the handlers are executed sequentially in the order as they were added.
 * Each of the handlers must call one of `request.continue()`, `request.abort()` and `request.respond()`.
 * In addition to that any of the handlers may modify the request object (method, postData, headers)
 * by passing its overrides to `request.continue()`.
 * If multiple handlers modify same property then the last one wins. Headers are merged separately so you can
 * override only a value of specific header.
 *
 * If one the handlers calls `request.abort()` or `request.respond()` then request is not propagated further
 * to any of the remaining handlers.
 *
 *
 * **Example usage:**
 *
 * ```javascript
 * // Replace images with placeholder.
 * await addInterceptRequestHandler(page, (request) => {
 *     if (request.resourceType() === 'image') {
 *         return request.respond({
 *             statusCode: 200,
 *             contentType: 'image/jpeg',
 *             body: placeholderImageBuffer,
 *         });
 *     }
 *     return request.continue();
 * });
 *
 * // Abort all the scripts.
 * await addInterceptRequestHandler(page, (request) => {
 *     if (request.resourceType() === 'script') return request.abort();
 *     return request.continue();
 * });
 *
 * // Change requests to post.
 * await addInterceptRequestHandler(page, (request) => {
 *     return request.continue({
 *          method: 'POST',
 *     });
 * });
 *
 * await page.goto('http://example.com');
 * ```
 *
 * @param page Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object.
 * @param handler Request interception handler.
 */
export declare function addInterceptRequestHandler(page: Page, handler: InterceptHandler): Promise<void>;
/**
 * Removes request interception handler for given page.
 *
 * @param page Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object.
 * @param handler Request interception handler.
 */
export declare function removeInterceptRequestHandler(page: Page, handler: InterceptHandler): Promise<void>;
//# sourceMappingURL=puppeteer_request_interception.d.ts.map