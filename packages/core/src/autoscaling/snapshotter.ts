import type { StorageBackend } from '@crawlee/types';
import ow from 'ow';

import type { Configuration } from '../configuration.js';
import type { CrawleeLogger } from '../log.js';
import { serviceLocator } from '../service_locator.js';
import type { ClientLoadSignal } from './client_load_signal.js';
import { createClientLoadSignal } from './client_load_signal.js';
import type { CpuLoadSignal } from './cpu_load_signal.js';
import { createCpuLoadSignal } from './cpu_load_signal.js';
import type { EventLoopLoadSignal } from './event_loop_load_signal.js';
import { createEventLoopLoadSignal } from './event_loop_load_signal.js';
import type { LoadSignal, LoadSignalStartContext } from './load_signal.js';
import { MemoryLoadSignal } from './memory_load_signal.js';

/**
 * How long the built-in signals retain snapshots, and — since the historical status is evaluated over the same
 * window — how far back autoscaling decisions look by default.
 * @internal
 */
export const DEFAULT_SNAPSHOT_HISTORY_SECS = 30;

/**
 * Per-signal tuning for the built-in **memory** load signal.
 */
export interface MemorySignalOptions {
    /**
     * Defines the maximum ratio of total memory that can be used.
     * Exceeding this limit overloads the memory.
     * @default 0.9
     */
    maxUsedRatio?: number;

    /**
     * Maximum ratio of overloaded snapshots in a sample before memory counts as overloaded.
     * @default 0.2
     */
    overloadedRatio?: number;
}

/**
 * Per-signal tuning for the built-in **event loop** load signal.
 */
export interface EventLoopSignalOptions {
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
 * Per-signal tuning for the built-in **CPU** load signal.
 */
export interface CpuSignalOptions {
    /**
     * Maximum ratio of overloaded snapshots in a sample before the CPU counts as overloaded.
     * @default 0.4
     */
    overloadedRatio?: number;
}

/**
 * Per-signal tuning for the built-in **client** (rate-limit) load signal.
 */
export interface ClientSignalOptions {
    /**
     * Defines the interval of checking the current state of the remote API client, in seconds.
     * @default 1
     */
    snapshotIntervalSecs?: number;

    /**
     * Defines the maximum number of new rate limit errors within the given interval.
     * @default 3
     */
    maxErrors?: number;

    /**
     * Maximum ratio of overloaded snapshots in a sample before the client counts as overloaded.
     * @default 0.3
     */
    overloadedRatio?: number;
}

/**
 * Tuning for the built-in load signals — the resources a {@apilink ConcurrencySystem} watches to decide whether the
 * machine is overloaded. Each of the four has its own bag of limits and its own `overloadedRatio`; anything else you
 * want taken into account goes into {@apilink LoadSignalsOptions.custom|`custom`}.
 *
 * How far back the signals are evaluated is not set here — that's the
 * {@apilink ConcurrencySystemOptions.snapshotHistorySecs|`snapshotHistorySecs`} /
 * {@apilink ConcurrencySystemOptions.currentHistorySecs|`currentHistorySecs`} pair, which applies to every signal
 * alike (and which signals size their snapshot retention to).
 */
export interface LoadSignalsOptions {
    /**
     * Tuning for the built-in memory load signal (used-memory limit + overload ratio), or `false` to switch it off.
     */
    memory?: MemorySignalOptions | false;

    /**
     * Tuning for the built-in event loop load signal (snapshot interval + blocked-millis limit + overload ratio), or
     * `false` to switch it off — which also stops its measuring interval.
     */
    eventLoop?: EventLoopSignalOptions | false;

    /**
     * Tuning for the built-in CPU load signal (overload ratio), or `false` to switch it off.
     */
    cpu?: CpuSignalOptions | false;

    /**
     * Tuning for the built-in client (rate-limit) load signal (snapshot interval + error limit + overload ratio), or
     * `false` to switch it off — worth doing when the storage backend reports no rate-limit statistics, since the
     * signal otherwise polls it every second to no purpose.
     */
    client?: ClientSignalOptions | false;

    /**
     * Additional {@apilink LoadSignal} implementations — e.g. navigation timeouts or proxy health — evaluated
     * alongside the built-in four. If any signal reports overload, the system counts as overloaded. Their lifecycle
     * is driven by the {@apilink ConcurrencySystem} they are given to.
     */
    custom?: LoadSignal[];
}

/**
 * An implementation detail of the {@apilink ConcurrencySystem}: the built-in signal tuning from
 * {@apilink LoadSignalsOptions} (custom signals are evaluated by the system, not collected by the snapshotter),
 * plus ambient dependencies.
 * @internal
 */
export interface SnapshotterOptions extends Omit<LoadSignalsOptions, 'custom'> {
    /** @internal */
    log?: CrawleeLogger;

    /** @internal */
    storageClient?: StorageBackend;

    /** @internal */
    config?: Configuration;
}

/**
 * Creates snapshots of system resources at given intervals and marks the resource
 * as either overloaded or not during the last interval. Keeps a history of the snapshots.
 * It tracks the following resources: Memory, EventLoop, API and CPU.
 * The class is used by the {@apilink ConcurrencySystem} class.
 *
 * When running on the Apify platform, the CPU and memory statistics are provided by the platform,
 * as collected from the running Docker container. When running locally, `Snapshotter`
 * makes its own statistics by querying the OS.
 *
 * CPU becomes overloaded locally when its current use exceeds the `maxUsedCpuRatio` {@apilink Configuration}
 * option or when the Apify platform marks it as overloaded.
 *
 * Memory becomes overloaded if its current use exceeds the {@apilink MemorySignalOptions.maxUsedRatio|`maxUsedRatio`}
 * option of the {@apilink SnapshotterOptions.memory|`memory`} signal bag.
 * It's computed using the total memory available to the container when running on
 * the Apify platform and a quarter of total system memory when running locally.
 * Max total memory when running locally may be overridden by using the `CRAWLEE_MEMORY_MBYTES`
 * environment variable.
 *
 * Event loop becomes overloaded if it slows down by more than the
 * {@apilink EventLoopSignalOptions.maxBlockedMillis|`maxBlockedMillis`} option of the
 * {@apilink SnapshotterOptions.eventLoop|`eventLoop`} signal bag.
 *
 * Client becomes overloaded when rate limit errors (429 - Too Many Requests),
 * typically received from the request queue, exceed the {@apilink ClientSignalOptions.maxErrors|`maxErrors`}
 * option of the {@apilink SnapshotterOptions.client|`client`} signal bag within the set interval.
 *
 * Configured indirectly through {@apilink ConcurrencySystemOptions.loadSignals|`loadSignals`}, which the
 * {@apilink ConcurrencySystem} unpacks into the per-signal {@apilink SnapshotterOptions} bags below.
 *
 * @category Scaling
 * @internal
 */
export class Snapshotter {
    readonly log: CrawleeLogger;
    readonly client: StorageBackend;
    readonly config: Configuration;

    // Absent when switched off through the corresponding option (e.g. `client: false`).
    private readonly memorySignal?: MemoryLoadSignal;
    private readonly eventLoopSignal?: EventLoopLoadSignal;
    private readonly cpuSignal?: CpuLoadSignal;
    private readonly clientSignal?: ClientLoadSignal;

    /**
     * Returns the enabled built-in signals, so `SystemStatus` can iterate them alongside any custom `LoadSignal`
     * instances. Signals switched off through the options are simply absent — the system status reports them as
     * not overloaded.
     */
    getLoadSignals(): LoadSignal[] {
        const builtin: (LoadSignal | undefined)[] = [
            this.memorySignal,
            this.eventLoopSignal,
            this.cpuSignal,
            this.clientSignal,
        ];

        return builtin.filter((signal): signal is LoadSignal => signal !== undefined);
    }

    /**
     * @param [options] All `Snapshotter` configuration options.
     */
    constructor(options: SnapshotterOptions = {}) {
        // Read the per-signal options before `ow` narrows `options` to the validator's own shape, which would erase
        // the `| false` in their declared types.
        const { memory = {}, eventLoop = {}, cpu = {}, client = {} } = options;

        ow(
            options,
            ow.object.exactShape({
                memory: ow.any(ow.object, ow.boolean, ow.undefined),
                eventLoop: ow.any(ow.object, ow.boolean, ow.undefined),
                cpu: ow.any(ow.object, ow.boolean, ow.undefined),
                client: ow.any(ow.object, ow.boolean, ow.undefined),
                log: ow.optional.object,
                storageClient: ow.optional.object,
                config: ow.optional.object,
            }),
        );

        const {
            log = serviceLocator.getLogger(),
            config = serviceLocator.getConfiguration(),
            storageClient = serviceLocator.getStorageBackend(),
        } = options;

        this.log = log.child({ prefix: 'Snapshotter' });
        this.client = storageClient;
        this.config = config;

        // Snapshot retention is not configured here - each signal is told the window it will be sampled over when it
        // starts, and keeps exactly that much history.
        if (memory !== false) {
            this.memorySignal = new MemoryLoadSignal({
                maxUsedMemoryRatio: memory.maxUsedRatio,
                overloadedRatio: memory.overloadedRatio,
                config: this.config,
                log: this.log,
            });
        }

        if (eventLoop !== false) {
            this.eventLoopSignal = createEventLoopLoadSignal({
                eventLoopSnapshotIntervalSecs: eventLoop.snapshotIntervalSecs,
                maxBlockedMillis: eventLoop.maxBlockedMillis,
                overloadedRatio: eventLoop.overloadedRatio,
            });
        }

        if (cpu !== false) {
            this.cpuSignal = createCpuLoadSignal({
                overloadedRatio: cpu.overloadedRatio,
                config: this.config,
            });
        }

        if (client !== false) {
            this.clientSignal = createClientLoadSignal({
                client: this.client,
                clientSnapshotIntervalSecs: client.snapshotIntervalSecs,
                maxClientErrors: client.maxErrors,
                overloadedRatio: client.overloadedRatio,
            });
        }
    }

    /**
     * Starts capturing snapshots at configured intervals. The `context` carries the sample window the signals will
     * be queried with, which is also how much history they retain.
     */
    async start(context: LoadSignalStartContext): Promise<void> {
        await Promise.all(this.getLoadSignals().map(async (signal) => signal.start(context)));
    }

    /**
     * Stops all resource capturing.
     */
    async stop(): Promise<void> {
        await Promise.all(this.getLoadSignals().map(async (signal) => signal.stop()));
        // Allow microtask queue to unwind before stop returns.
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
    }
}
