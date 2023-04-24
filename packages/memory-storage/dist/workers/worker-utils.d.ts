import type { WorkerReceivedMessage } from '../utils';
export declare function handleMessage(message: WorkerReceivedMessage & {
    messageId: string;
}): Promise<void>;
export declare function lockAndWrite(filePath: string, data: unknown, stringify?: boolean, retry?: number, timeout?: number): Promise<void>;
//# sourceMappingURL=worker-utils.d.ts.map