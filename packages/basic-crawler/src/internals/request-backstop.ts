import { TimeoutError } from '@apify/timeout';

/**
 * The shared navigation-window deadline (epoch millis), stored on the in-flight context so the pre- and
 * post-navigation hooks and the navigation itself all draw from one budget - and so `context.extendTimeout`
 * can push the whole window, not just the current step.
 * @internal
 */
export const navigationDeadlineKey = Symbol('navigationDeadline');

/**
 * Lets `context.extendTimeout` push back the request backstop as well. The backstop is a bare timer rather than
 * an `addTimeoutToPromise` frame, so `extendTimeout` from `@apify/timeout` cannot reach it on its own.
 * @internal
 */
export const extendBackstopKey = Symbol('extendBackstop');

/**
 * Returns `true` once the backstop has fired for this request. The backstop cannot cancel work stuck somewhere
 * we do not control, but the phases we do run (e.g. the request handler) check this at their start and bail, so
 * a request whose backstop already elapsed does not carry on after the crawler moved past it.
 * @internal
 */
export const backstopExpiredKey = Symbol('backstopExpired');

/** The slots the backstop hangs on the in-flight crawling context. */
export interface BackstopContext {
    [extendBackstopKey]?: (extraMillis: number) => void;
    [backstopExpiredKey]?: () => boolean;
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
 * Races `work` against a `timeoutMillis` backstop, so a request stuck in a phase that has no timeout of its own
 * (anything that is not the navigation, a navigation hook or the request handler) still fails instead of stalling
 * the crawler.
 *
 * The backstop is a bare timer, not an `addTimeoutToPromise` frame: nested `addTimeoutToPromise` calls share one
 * `AbortController`, so wrapping the request in one would let the request handler timing out abort this outer
 * context too, cancelling the error handling that follows it.
 *
 * `Promise.race` attaches a handler to both sides, so a late rejection from `work` cannot go unhandled. The losing
 * side is not cancelled - by definition it is stuck somewhere we do not control - but the phases we do run check
 * {@apilink backstopExpiredKey} at their start and bail, so a request whose backstop already fired does not carry
 * on (e.g. run the handler) after the crawler has moved past it. `context.extendTimeout` pushes the deadline back
 * via {@apilink extendBackstopKey}.
 */
export async function raceWithBackstop(
    context: BackstopContext,
    work: Promise<void>,
    { timeoutMillis, requestId }: { timeoutMillis: number; requestId?: string },
): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    let deadline = Date.now() + timeoutMillis;
    let settled = false;
    let firedByBackstop = false;

    const backstop = new Promise<never>((_, reject) => {
        const fire = () => {
            settled = true;
            firedByBackstop = true;
            reject(new TimeoutError(`Request timed out after ${timeoutMillis / 1e3} seconds (${requestId}).`));
        };

        timer = setTimeout(fire, timeoutMillis);

        context[backstopExpiredKey] = () => firedByBackstop;

        context[extendBackstopKey] = (extraMillis: number) => {
            if (settled) {
                return;
            }

            clearTimeout(timer);
            deadline += extraMillis;
            timer = setTimeout(fire, Math.max(deadline - Date.now(), 0));
        };
    });

    try {
        await Promise.race([work, backstop]);
    } finally {
        settled = true;
        clearTimeout(timer);
    }
}
