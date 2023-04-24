import type { WorkerReceivedMessage } from '../utils';
export declare const promiseMap: Map<string, {
    promise: Promise<void>;
    resolve: () => void;
}>;
export declare function sendWorkerMessage(message: WorkerReceivedMessage): void;
export declare function initWorkerIfNeeded(): void;
//# sourceMappingURL=instance.d.ts.map