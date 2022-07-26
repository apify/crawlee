import { promiseMap } from './instance';
import { handleMessage } from './worker-utils';

export class FileStorageWorkerEmulator {
    async postMessage(value: any): Promise<void> {
        await handleMessage(value);

        promiseMap.get(value.messageId)?.resolve();
        promiseMap.delete(value.messageId);
    }

    terminate(): void {}

    unref(): void {}
}
