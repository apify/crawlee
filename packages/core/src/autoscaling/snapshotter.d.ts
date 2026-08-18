import type { CpuLoadSignalOptions } from './cpu_load_signal.js';
import type { EventLoopLoadSignalOptions } from './event_loop_load_signal.js';
import type { LoadSignal, LoadSignalStartContext } from './load_signal.js';
import type { MemoryLoadSignalOptions } from './memory_load_signal.js';
import type { StorageBackendLoadSignalOptions } from './storage_backend_load_signal.js';
/**
 * The load signals a {@apilink ConcurrencySystem} watches to decide whether the machine is overloaded.
 *
 * Each of the four built-in signals is configured by passing its options bag — shorthand for constructing the
 * corresponding {@apilink LoadSignal} class yourself, so `{ cpu: { overloadedRatio: 0.5 } }` is exactly
 * `{ cpu: false, custom: [new CpuLoadSignal({ overloadedRatio: 0.5 })] }`. Pass `false` to leave a resource
 * unwatched, and put anything else you want taken into account in {@apilink LoadSignalsOptions.custom|`custom`}.
 *
 * How far back the signals are evaluated is *not* set here, but by
 * {@apilink ConcurrencySystemOptions.snapshotHistorySecs|`snapshotHistorySecs`} and
 * {@apilink ConcurrencySystemOptions.currentHistorySecs|`currentHistorySecs`}.
 */
export interface LoadSignalsOptions {
    /**
     * Tuning for the built-in {@apilink MemoryLoadSignal} (used-memory limit + overload ratio), or `false` to switch
     * it off.
     */
    memory?: MemoryLoadSignalOptions | false;
    /**
     * Tuning for the built-in {@apilink EventLoopLoadSignal} (snapshot interval + blocked-millis limit + overload
     * ratio), or `false` to switch it off — which also stops its measuring interval.
     */
    eventLoop?: EventLoopLoadSignalOptions | false;
    /**
     * Tuning for the built-in {@apilink CpuLoadSignal} (overload ratio), or `false` to switch it off.
     */
    cpu?: CpuLoadSignalOptions | false;
    /**
     * Tuning for the built-in {@apilink StorageBackendLoadSignal} (snapshot interval + error limit + overload ratio),
     * or `false` to switch it off — worth doing when the storage backend reports no rate-limit statistics, since the
     * signal otherwise polls it every second to no purpose.
     */
    storageBackend?: StorageBackendLoadSignalOptions | false;
    /**
     * Additional {@apilink LoadSignal} implementations — e.g. navigation timeouts or proxy health — evaluated
     * alongside the built-in four. If any signal reports overload, the system counts as overloaded. Their lifecycle
     * is driven by the {@apilink ConcurrencySystem} they are given to, and their {@apilink LoadSignal.name|names} must
     * not collide with an enabled built-in's.
     */
    custom?: LoadSignal[];
}
/**
 * An implementation detail of the {@apilink ConcurrencySystem}: the built-in signal tuning from
 * {@apilink LoadSignalsOptions}, minus the custom signals, which the system evaluates itself rather than collecting
 * them here.
 * @internal
 */
export type SnapshotterOptions = Omit<LoadSignalsOptions, 'custom'>;
/**
 * Owns the four built-in {@apilink LoadSignal} instances — {@apilink MemoryLoadSignal},
 * {@apilink EventLoopLoadSignal}, {@apilink CpuLoadSignal} and {@apilink StorageBackendLoadSignal} — constructing
 * the ones that were not switched off and driving their shared lifecycle.
 *
 * Configured indirectly through {@apilink ConcurrencySystemOptions.loadSignals|`loadSignals`}, whose per-signal bags
 * are simply forwarded to the corresponding constructor.
 * @internal
 */
export declare class Snapshotter {
    #private;
    /**
     * Returns the enabled built-in signals, so `SystemStatus` can iterate them alongside any custom `LoadSignal`
     * instances. Signals switched off through the options are simply absent — the system status reports them as
     * not overloaded.
     */
    getLoadSignals(): LoadSignal[];
    /**
     * @param [options] All `Snapshotter` configuration options.
     */
    constructor(options?: SnapshotterOptions);
    /**
     * Starts capturing snapshots at configured intervals. The `context` carries the sample window the signals will
     * be queried with, which is also how much history they retain.
     */
    start(context: LoadSignalStartContext): Promise<void>;
    /**
     * Stops all resource capturing.
     */
    stop(): Promise<void>;
}
