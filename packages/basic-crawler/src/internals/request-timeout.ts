/**
 * The shared navigation-window deadline (epoch millis), stored on the in-flight context so the pre- and
 * post-navigation hooks and the navigation itself all draw from one budget - and so `context.extendTimeout`
 * can push the whole window, not just the current step.
 * @internal
 */
export const navigationDeadlineKey = Symbol('navigationDeadline');

/**
 * Returns `true` once the internal request timeout has fired for this request. Work stuck somewhere that never
 * calls `tryCancel()` keeps running after that, so the phases we do run (e.g. the request handler) check this at
 * their start and bail, rather than carrying on after the crawler moved past the request.
 */
export const timeoutExpiredKey = Symbol('timeoutExpired');

/** The slots the internal request timeout hangs on the in-flight crawling context. */
export interface RequestTimeoutContext {
    [timeoutExpiredKey]?: () => boolean;
    [navigationDeadlineKey]?: number;
}

/**
 * Milliseconds left in the shared navigation window for `ctx`, lazily starting the window on first use.
 * @internal
 */
export function remainingNavigationWindowMillis(ctx: object, windowMillis: number): number {
    const store = ctx as Record<symbol, number>;
    store[navigationDeadlineKey] ??= Date.now() + windowMillis;
    return store[navigationDeadlineKey] - Date.now();
}
