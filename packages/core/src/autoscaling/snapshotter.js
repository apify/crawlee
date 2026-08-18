import { CpuLoadSignal } from './cpu_load_signal.js';
import { EventLoopLoadSignal } from './event_loop_load_signal.js';
import { MemoryLoadSignal } from './memory_load_signal.js';
import { StorageBackendLoadSignal } from './storage_backend_load_signal.js';
/**
 * Owns the four built-in {@apilink LoadSignal} instances — {@apilink MemoryLoadSignal},
 * {@apilink EventLoopLoadSignal}, {@apilink CpuLoadSignal} and {@apilink StorageBackendLoadSignal} — constructing
 * the ones that were not switched off and driving their shared lifecycle.
 *
 * Configured indirectly through {@apilink ConcurrencySystemOptions.loadSignals|`loadSignals`}, whose per-signal bags
 * are simply forwarded to the corresponding constructor.
 * @internal
 */
export class Snapshotter {
    // Absent when switched off through the corresponding option (e.g. `storageBackend: false`).
    #memorySignal;
    #eventLoopSignal;
    #cpuSignal;
    #storageBackendSignal;
    /**
     * Returns the enabled built-in signals, so `SystemStatus` can iterate them alongside any custom `LoadSignal`
     * instances. Signals switched off through the options are simply absent — the system status reports them as
     * not overloaded.
     */
    getLoadSignals() {
        const builtin = [
            this.#memorySignal,
            this.#eventLoopSignal,
            this.#cpuSignal,
            this.#storageBackendSignal,
        ];
        return builtin.filter((signal) => signal !== undefined);
    }
    /**
     * @param [options] All `Snapshotter` configuration options.
     */
    constructor(options = {}) {
        const { memory = {}, eventLoop = {}, cpu = {}, storageBackend = {} } = options;
        // Each signal resolves its own ambient dependencies when started, and is told the window it will be sampled
        // over then too - so there is nothing to thread in here beyond the caller's tuning.
        if (memory !== false)
            this.#memorySignal = new MemoryLoadSignal(memory);
        if (eventLoop !== false)
            this.#eventLoopSignal = new EventLoopLoadSignal(eventLoop);
        if (cpu !== false)
            this.#cpuSignal = new CpuLoadSignal(cpu);
        if (storageBackend !== false)
            this.#storageBackendSignal = new StorageBackendLoadSignal(storageBackend);
    }
    /**
     * Starts capturing snapshots at configured intervals. The `context` carries the sample window the signals will
     * be queried with, which is also how much history they retain.
     */
    async start(context) {
        await Promise.all(this.getLoadSignals().map(async (signal) => signal.start(context)));
    }
    /**
     * Stops all resource capturing.
     */
    async stop() {
        await Promise.all(this.getLoadSignals().map(async (signal) => signal.stop()));
        // Allow microtask queue to unwind before stop returns.
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
    }
}
