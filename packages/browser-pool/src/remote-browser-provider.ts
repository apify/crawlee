/**
 * Abstract base class for remote browser service providers.
 *
 * Implement this class to encapsulate the lifecycle of a remote browser session
 * (creation, connection URL resolution, and cleanup). The framework calls
 * {@link connect} once per browser launch and {@link release} when the browser
 * closes or crashes.
 *
 * **Example — simple static endpoint (e.g. Browserless):**
 * ```typescript
 * class BrowserlessProvider extends RemoteBrowserProvider {
 *     constructor(private url: string) { super(); }
 *     async connect() { return { url: this.url }; }
 * }
 * ```
 *
 * **Example — session lifecycle (e.g. Browserbase):**
 * ```typescript
 * class BrowserbaseProvider extends RemoteBrowserProvider<{ id: string }> {
 *     constructor(private apiKey: string, private projectId: string) { super(); }
 *
 *     async connect() {
 *         const session = await createSession(this.apiKey, this.projectId);
 *         return { url: session.connectUrl, context: { id: session.id } };
 *     }
 *
 *     async release(context: { id: string }) {
 *         await releaseSession(this.apiKey, context.id);
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
     * Called when the browser closes, crashes, or the pool is destroyed.
     * Override this to clean up remote sessions, release API resources, etc.
     *
     * Errors thrown here are caught and logged as warnings — they never crash the crawler.
     *
     * @param _context The same `context` object returned by {@link connect}.
     */
    async release(_context: TContext): Promise<void> {}
}
