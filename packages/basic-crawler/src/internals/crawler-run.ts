import type { AutoscaledPoolOptions, CrawleeLogger, IConcurrencySystem } from '@crawlee/core';
import { AutoscaledPool } from '@crawlee/core';

/** Everything a run needs to exist. Whatever a crawler resolves per run is resolved before the run is built. */
export interface CrawlerRunSetup {
    log: CrawleeLogger;
    /** The governor this run books its requests against, started and stopped by whoever owns it. */
    concurrencySystem: IConcurrencySystem;
    taskLoopOptions: Omit<AutoscaledPoolOptions, 'concurrencySystem' | 'consumer'>;
    consumer: AutoscaledPoolOptions['consumer'];
}

/**
 * Everything that belongs to a single {@apilink BasicCrawler.run|`crawler.run()`} — the task loop dispatching its
 * requests, the concurrency governor those requests are booked against, and the bookkeeping that must not survive
 * into a later run.
 *
 * The crawler builds a fresh one for every run, which is what keeps per-run state from leaking across runs: there
 * is no reset checklist to keep in sync. A finished run stays readable as the history of the last crawl, so
 * liveness is asked about explicitly (`isLive`) rather than inferred from presence.
 *
 * The lifecycle is `dispatchRequests()` and `finish()`. Everything a run owns exists from construction, so there
 * is no half-built state to guard against in between.
 *
 * @internal
 */
export class CrawlerRun {
    readonly #log: CrawleeLogger;
    readonly #autoscaledPool: AutoscaledPool;
    readonly #loggedOnce = new Set<string>();

    #stopRequested = false;
    #dispatching = false;
    #ended = false;
    #finished = false;
    #wakeTimer?: NodeJS.Timeout;
    #wakeAt = 0;

    /** Whether this run initialized the ambient event manager, and is therefore the one that closes it. */
    ownsEventManager = false;

    constructor(setup: CrawlerRunSetup) {
        this.#log = setup.log;

        this.#autoscaledPool = new AutoscaledPool({
            ...setup.taskLoopOptions,
            concurrencySystem: setup.concurrencySystem,
            consumer: setup.consumer,
        });
    }

    /**
     * Runs the task loop until the crawl is over or {@apilink CrawlerRun.abort|aborted}. The governor has to be
     * running by now — the task loop refuses to book anything against one that is not.
     */
    async dispatchRequests(): Promise<void> {
        this.#dispatching = true;

        try {
            await this.#autoscaledPool.run();
        } finally {
            this.#dispatching = false;
        }
    }

    /** Whether the `run()` call this belongs to is still executing. */
    get isLive(): boolean {
        return !this.#finished;
    }

    /**
     * Whether the task loop is dispatching requests. Pausing one that has not started would not suspend a crawl,
     * it would keep it from ever starting.
     */
    get isDispatching(): boolean {
        return this.#dispatching;
    }

    /** Whether a graceful shutdown of this run has been requested. */
    get stopRequested(): boolean {
        return this.#stopRequested;
    }

    /** Asks the run to stop taking new requests. Only the first call logs `reason`. */
    stop(reason: string): void {
        if (this.#stopRequested) {
            return;
        }

        this.#log.info(reason);
        this.#stopRequested = true;
    }

    /** Stops dispatching new requests, resolving once the ones in flight have settled. */
    async pause(timeoutSecs?: number): Promise<void> {
        await this.#autoscaledPool.pause(timeoutSecs);
    }

    /** Resumes dispatching after a {@apilink CrawlerRun.pause|`pause()`}. */
    resume(): void {
        this.#autoscaledPool.resume();
    }

    /** Ends the crawl without waiting for the requests in flight, so a pending `crawl()` resolves. */
    async abort(): Promise<void> {
        await this.#autoscaledPool.abort();
    }

    /**
     * Logs `message` the first time this run asks for it under `key`. Keyed rather than deduped by text, so that
     * two messages describing the same shutdown say it once between them.
     */
    logOnce(key: string, message: string): void {
        if (this.#loggedOnce.has(key)) {
            return;
        }

        this.#log.info(message);
        this.#loggedOnce.add(key);
    }

    /**
     * Nudges the task loop at `readyAt`, when the request manager says it will have work again. The loop polls on
     * its own anyway, so this only shortens the wait — hence a single timer that only an earlier wake-up replaces,
     * `unref`'d so it never keeps the process alive. A run that has ended arms nothing.
     */
    scheduleWake(readyAt: number): void {
        if (this.#ended) {
            return;
        }

        if (this.#wakeTimer !== undefined) {
            if (this.#wakeAt <= readyAt) {
                return;
            }

            clearTimeout(this.#wakeTimer);
        }

        this.#wakeAt = readyAt;
        this.#wakeTimer = setTimeout(
            () => {
                this.#wakeTimer = undefined;
                void this.#autoscaledPool.notify();
            },
            Math.max(0, readyAt - Date.now()),
        );
        this.#wakeTimer.unref();
    }

    /**
     * Ends the run: drops a pending wake-up and aborts the task loop. Idempotent, so aborting a run through
     * `teardown()` and then finishing it does the work once. The governor is left alone — it belongs to whoever
     * started it.
     */
    async end(): Promise<void> {
        if (this.#ended) {
            return;
        }

        this.#ended = true;

        if (this.#wakeTimer !== undefined) {
            clearTimeout(this.#wakeTimer);
            this.#wakeTimer = undefined;
        }

        await this.#autoscaledPool.abort();
    }

    /**
     * Ends the run and marks it as history: the crawler stops reporting itself as running, and what is left is
     * readable but no longer drivable. Ending here too means a subclass `teardown()` that forgets `super` cannot
     * leave the task loop dispatching.
     */
    async finish(): Promise<void> {
        await this.end();
        this.#finished = true;
    }
}
