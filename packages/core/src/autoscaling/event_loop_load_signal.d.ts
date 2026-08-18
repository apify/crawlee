import type { LoadSignal, LoadSignalStartContext, LoadSnapshot } from './load_signal.js';
/**
 * A snapshot produced by the built-in event loop signal.
 * @internal
 */
export interface EventLoopSnapshot extends LoadSnapshot {
    exceededMillis: number;
}
/**
 * Tuning for the built-in **event loop** load signal, as accepted both by {@apilink EventLoopLoadSignal} and by the
 * {@apilink LoadSignalsOptions.eventLoop|`eventLoop`} shorthand on {@apilink LoadSignalsOptions}.
 */
export interface EventLoopLoadSignalOptions {
    /**
     * Defines the interval of measuring the event loop response time, in seconds.
     * @default 0.5
     */
    snapshotIntervalSecs?: number;
    /**
     * Maximum allowed delay of the event loop in milliseconds.
     * Exceeding this limit overloads the event loop.
     * @default 50
     */
    maxBlockedMillis?: number;
    /**
     * Maximum ratio of overloaded snapshots in a sample before the event loop counts as overloaded.
     * @default 0.6
     */
    overloadedRatio?: number;
}
/**
 * Periodically measures event loop delay and reports overload when the delay exceeds a configured threshold.
 *
 * Built by default; construct one yourself only to wrap or adapt it — see {@apilink LoadSignal}.
 *
 * @category Scaling
 */
export declare class EventLoopLoadSignal implements LoadSignal {
    #private;
    readonly name = "eventLoopInfo";
    readonly overloadedRatio: number;
    constructor(options?: EventLoopLoadSignalOptions);
    start(context: LoadSignalStartContext): Promise<void>;
    stop(): Promise<void>;
    getSample(sampleDurationMillis?: number): LoadSnapshot[];
    /**
     * Records one snapshot: how much later than scheduled this tick ran is how long the loop was blocked.
     * @internal Also lets tests drive the measurement without waiting on a timer.
     */
    handle(intervalCallback: () => unknown): void;
}
