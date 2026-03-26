import type { StorageClient } from '@crawlee/types';
import ow from 'ow';

import type { Log } from '@apify/log';

import { Configuration } from '../configuration';
import type { EventManager } from '../events/event_manager';
import { log as defaultLog } from '../log';
import type { ClientLoadSignal, ClientSnapshot } from './client_load_signal';
import { createClientLoadSignal } from './client_load_signal';
import type { CpuLoadSignal, CpuSnapshot } from './cpu_load_signal';
import { createCpuLoadSignal } from './cpu_load_signal';
import type { EventLoopLoadSignal, EventLoopSnapshot } from './event_loop_load_signal';
import { createEventLoopLoadSignal } from './event_loop_load_signal';
import type { LoadSignal } from './load_signal';
import type { MemorySnapshot } from './memory_load_signal';
import { MemoryLoadSignal } from './memory_load_signal';
import type { SystemInfo } from './system_status';

export interface SnapshotterOptions {
    /**
     * Defines the interval of measuring the event loop response time.
     * @default 0.5
     */
    eventLoopSnapshotIntervalSecs?: number;

    /**
     * Defines the interval of checking the current state
     * of the remote API client.
     * @default 1
     */
    clientSnapshotIntervalSecs?: number;

    /**
     * Maximum allowed delay of the event loop in milliseconds.
     * Exceeding this limit overloads the event loop.
     * @default 50
     */
    maxBlockedMillis?: number;

    /**
     * Defines the maximum ratio of total memory that can be used.
     * Exceeding this limit overloads the memory.
     * @default 0.9
     */
    maxUsedMemoryRatio?: number;

    /**
     * Defines the maximum number of new rate limit errors within
     * the given interval.
     * @default 1
     */
    maxClientErrors?: number;

    /**
     * Sets the interval in seconds for which a history of resource snapshots
     * will be kept. Increasing this to very high numbers will affect performance.
     * @default 60
     */
    snapshotHistorySecs?: number;

    /** @internal */
    log?: Log;

    /** @internal */
    client?: StorageClient;

    /** @internal */
    config?: Configuration;
}

/**
 * Creates snapshots of system resources at given intervals and marks the resource
 * as either overloaded or not during the last interval. Keeps a history of the snapshots.
 * It tracks the following resources: Memory, EventLoop, API and CPU.
 * The class is used by the {@apilink AutoscaledPool} class.
 *
 * When running on the Apify platform, the CPU and memory statistics are provided by the platform,
 * as collected from the running Docker container. When running locally, `Snapshotter`
 * makes its own statistics by querying the OS.
 *
 * CPU becomes overloaded locally when its current use exceeds the `maxUsedCpuRatio` option or
 * when Apify platform marks it as overloaded.
 *
 * Memory becomes overloaded if its current use exceeds the `maxUsedMemoryRatio` option.
 * It's computed using the total memory available to the container when running on
 * the Apify platform and a quarter of total system memory when running locally.
 * Max total memory when running locally may be overridden by using the `CRAWLEE_MEMORY_MBYTES`
 * environment variable.
 *
 * Event loop becomes overloaded if it slows down by more than the `maxBlockedMillis` option.
 *
 * Client becomes overloaded when rate limit errors (429 - Too Many Requests),
 * typically received from the request queue, exceed the set limit within the set interval.
 *
 * @category Scaling
 */
export class Snapshotter {
    log: Log;
    client: StorageClient;
    config: Configuration;
    events: EventManager;

    private readonly memorySignal: MemoryLoadSignal;
    private readonly eventLoopSignal: EventLoopLoadSignal;
    private readonly cpuSignal: CpuLoadSignal;
    private readonly clientSignal: ClientLoadSignal;

    /**
     * Returns the four built-in signals as an array, so `SystemStatus` can
     * iterate them alongside any custom `LoadSignal` instances.
     */
    getLoadSignals(): LoadSignal[] {
        return [this.memorySignal, this.eventLoopSignal, this.cpuSignal, this.clientSignal];
    }

    // Legacy public properties kept for backward compat (tests read these directly)
    get cpuSnapshots(): CpuSnapshot[] {
        return this.cpuSignal.store.getAll();
    }

    get eventLoopSnapshots(): EventLoopSnapshot[] {
        return this.eventLoopSignal.store.getAll();
    }

    get memorySnapshots(): MemorySnapshot[] {
        return this.memorySignal.getMemorySnapshots();
    }

    get clientSnapshots(): ClientSnapshot[] {
        return this.clientSignal.store.getAll();
    }

    /**
     * @param [options] All `Snapshotter` configuration options.
     */
    constructor(options: SnapshotterOptions = {}) {
        ow(
            options,
            ow.object.exactShape({
                eventLoopSnapshotIntervalSecs: ow.optional.number,
                clientSnapshotIntervalSecs: ow.optional.number,
                snapshotHistorySecs: ow.optional.number,
                maxBlockedMillis: ow.optional.number,
                maxUsedMemoryRatio: ow.optional.number,
                maxClientErrors: ow.optional.number,
                log: ow.optional.object,
                client: ow.optional.object,
                config: ow.optional.object,
            }),
        );

        const {
            eventLoopSnapshotIntervalSecs = 0.5,
            clientSnapshotIntervalSecs = 1,
            snapshotHistorySecs = 30,
            maxBlockedMillis = 50,
            maxUsedMemoryRatio = 0.9,
            maxClientErrors = 3,
            log = defaultLog,
            config = Configuration.getGlobalConfig(),
            client = config.getStorageClient(),
        } = options;

        this.log = log.child({ prefix: 'Snapshotter' });
        this.client = client;
        this.config = config;
        this.events = this.config.getEventManager();

        const snapshotHistoryMillis = snapshotHistorySecs * 1000;

        this.memorySignal = new MemoryLoadSignal({
            maxUsedMemoryRatio,
            snapshotHistoryMillis,
            config: this.config,
            log: this.log,
        });

        this.eventLoopSignal = createEventLoopLoadSignal({
            eventLoopSnapshotIntervalSecs,
            maxBlockedMillis,
            snapshotHistoryMillis,
        });

        this.cpuSignal = createCpuLoadSignal({
            snapshotHistoryMillis,
            config: this.config,
        });

        this.clientSignal = createClientLoadSignal({
            client: this.client,
            clientSnapshotIntervalSecs,
            maxClientErrors,
            snapshotHistoryMillis,
        });
    }

    /**
     * Starts capturing snapshots at configured intervals.
     */
    async start(): Promise<void> {
        await this.memorySignal.start();
        await this.eventLoopSignal.start();
        await this.cpuSignal.start();
        await this.clientSignal.start();
    }

    /**
     * Stops all resource capturing.
     */
    async stop(): Promise<void> {
        await this.memorySignal.stop();
        await this.eventLoopSignal.stop();
        await this.cpuSignal.stop();
        await this.clientSignal.stop();
        // Allow microtask queue to unwind before stop returns.
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
    }

    /**
     * Returns a sample of latest memory snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getMemorySample(sampleDurationMillis?: number): MemorySnapshot[] {
        return this.memorySignal.getSample(sampleDurationMillis);
    }

    /**
     * Returns a sample of latest event loop snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getEventLoopSample(sampleDurationMillis?: number): EventLoopSnapshot[] {
        return this.eventLoopSignal.getSample(sampleDurationMillis);
    }

    /**
     * Returns a sample of latest CPU snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getCpuSample(sampleDurationMillis?: number): CpuSnapshot[] {
        return this.cpuSignal.getSample(sampleDurationMillis);
    }

    /**
     * Returns a sample of latest Client snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getClientSample(sampleDurationMillis?: number): ClientSnapshot[] {
        return this.clientSignal.getSample(sampleDurationMillis);
    }

    /**
     * @deprecated Kept for backward compatibility.
     */
    protected _snapshotMemory(systemInfo: SystemInfo) {
        this.memorySignal._onSystemInfo(systemInfo);
    }

    /**
     * @deprecated Kept for backward compatibility.
     */
    protected _memoryOverloadWarning(systemInfo: SystemInfo) {
        this.memorySignal._memoryOverloadWarning(systemInfo);
    }

    /**
     * @deprecated Kept for backward compatibility.
     */
    protected _snapshotEventLoop(intervalCallback: () => unknown) {
        this.eventLoopSignal.handle(intervalCallback);
    }

    /**
     * @deprecated Kept for backward compatibility.
     */
    protected _snapshotCpu(systemInfo: SystemInfo) {
        this.cpuSignal.handle(systemInfo);
    }

    /**
     * @deprecated Kept for backward compatibility.
     */
    protected _snapshotClient(intervalCallback: () => unknown) {
        this.clientSignal.handle(intervalCallback);
    }

    /**
     * @deprecated Pruning is now handled by individual signals.
     */
    protected _pruneSnapshots(_snapshots: any[], _now: Date) {
        // no-op — signals prune themselves
    }
}
