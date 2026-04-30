/**
 * Abstract base class for remote browser service providers.
 *
 * Implement this class to encapsulate the lifecycle of a remote browser session
 * (creation, connection URL resolution, and cleanup). The framework calls
 * {@link connect} once per browser launch and {@link release} when the browser
 * closes, crashes, the pool is destroyed, or the connection fails during launch.
 *
 * Pass the provider instance as the `remoteBrowser` option on the crawler's
 * `launchContext` or directly on the plugin constructor:
 *
 * ```typescript
 * const crawler = new PlaywrightCrawler({
 *     launchContext: {
 *         remoteBrowser: new MyProvider(),
 *     },
 * });
 * ```
 *
 * **Example — simple static endpoint (e.g. Browserless):**
 * ```typescript
 * class BrowserlessProvider extends RemoteBrowserProvider {
 *     maxOpenBrowsers = 2; // respect the service's concurrent session limit
 *
 *     async connect() {
 *         return { url: `wss://production-sfo.browserless.io?token=${token}` };
 *     }
 * }
 * ```
 *
 * **Example — session lifecycle with concurrency limit (e.g. Browserbase):**
 * ```typescript
 * class BrowserbaseProvider extends RemoteBrowserProvider<{ id: string }> {
 *     maxOpenBrowsers = 2; // respect the service's concurrent session limit
 *
 *     async connect() {
 *         const session = await createSession(apiKey, projectId);
 *         return { url: session.connectUrl, context: { id: session.id } };
 *     }
 *
 *     async release(context: { id: string }) {
 *         await releaseSession(apiKey, context.id);
 *     }
 * }
 * ```
 */
export abstract class RemoteBrowserProvider<TContext extends Record<string, unknown> = Record<string, unknown>> {
    /**
     * Connection type.
     * - `'cdp'` — Chrome DevTools Protocol, works with Puppeteer and Playwright.
     * - `'websocket'` — Playwright-specific WebSocket protocol (not supported by Puppeteer).
     *
     * @default 'cdp'
     */
    type: 'cdp' | 'websocket' = 'cdp';

    /**
     * Maximum number of browsers that can be open at the same time.
     * Set this to your remote service's concurrent session limit to avoid 429 errors.
     */
    maxOpenBrowsers?: number;

    /**
     * Called once per browser launch. Return the WebSocket/CDP endpoint URL
     * and an optional `context` object that will be passed back to {@link release}.
     */
    abstract connect(): Promise<{ url: string; context?: TContext }> | { url: string; context?: TContext };

    /**
     * Called when the browser closes, crashes, the pool is destroyed, or the
     * connection fails right after {@link connect} succeeds.
     * Override this to clean up remote sessions, release API resources, etc.
     *
     * Errors thrown here are caught and logged as warnings — they never crash the crawler.
     * Safe to assume this is called at most once per {@link connect} call.
     *
     * @param _context The same `context` object returned by {@link connect}.
     */
    async release(_context: TContext): Promise<void> {}
}
