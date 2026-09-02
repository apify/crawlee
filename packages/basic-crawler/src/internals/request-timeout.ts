import { TimeoutError } from '@apify/timeout';

/**
 * The shared navigation-window deadline (epoch millis), stored on the in-flight context so the pre- and
 * post-navigation hooks and the navigation itself all draw from one budget - and so `context.extendTimeout`
 * can push the whole window, not just the current step.
 * @internal
 */
export const navigationDeadlineKey = Symbol('navigationDeadline');

/**
 * Lets `context.extendTimeout` push back the internal request timeout as well. That timeout is a bare timer
 * rather than an `addTimeoutToPromise` frame, so `extendTimeout` from `@apify/timeout` cannot reach it on its own.
 */
export const extendTimeoutKey = Symbol('extendTimeout');

/**
 * Returns `true` once the internal request timeout has fired for this request. It cannot cancel work stuck
 * somewhere we do not control, but the phases we do run (e.g. the request handler) check this at their start and
 * bail, so a request whose timeout already elapsed does not carry on after the crawler moved past it.
 */
export const timeoutExpiredKey = Symbol('timeoutExpired');

/** The slots the internal request timeout hangs on the in-flight crawling context. */
export interface RequestTimeoutContext {
    [extendTimeoutKey]?: (extraMillis: number) => void;
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

/**
 * Races `work` against a `timeoutMillis` timeout, so a request stuck in a phase that has no timeout of its own
 * (anything that is not the navigation, a navigation hook or the request handler) still fails instead of stalling
 * the crawler.
 *
 * This is a bare timer, not an `addTimeoutToPromise` frame: nested `addTimeoutToPromise` calls share one
 * `AbortController`, so wrapping the request in one would let the request handler timing out abort this outer
 * context too, cancelling the error handling that follows it.
 *
 * `Promise.race` attaches a handler to both sides, so a late rejection from `work` cannot go unhandled. The losing
 * side is not cancelled - by definition it is stuck somewhere we do not control - but the phases we do run check
 * {@apilink timeoutExpiredKey} at their start and bail, so a request whose timeout already fired does not carry
 * on (e.g. run the handler) after the crawler has moved past it. `context.extendTimeout` pushes the deadline back
 * via {@apilink extendTimeoutKey}.
 */
export async function raceWithTimeout(
    context: RequestTimeoutContext,
    work: Promise<void>,
    { timeoutMillis, requestId }: { timeoutMillis: number; requestId?: string },
): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    let deadline = Date.now() + timeoutMillis;
    let settled = false;
    let firedByTimeout = false;

    const timeout = new Promise<never>((_, reject) => {
        const fire = () => {
            settled = true;
            firedByTimeout = true;
            reject(new TimeoutError(`Request timed out after ${timeoutMillis / 1e3} seconds (${requestId}).`));
        };

        timer = setTimeout(fire, timeoutMillis);

        context[timeoutExpiredKey] = () => firedByTimeout;

        context[extendTimeoutKey] = (extraMillis: number) => {
            if (settled) {
                return;
            }

            clearTimeout(timer);
            deadline += extraMillis;
            timer = setTimeout(fire, Math.max(deadline - Date.now(), 0));
        };
    });

    try {
        await Promise.race([work, timeout]);
    } finally {
        settled = true;
        clearTimeout(timer);
    }
}
