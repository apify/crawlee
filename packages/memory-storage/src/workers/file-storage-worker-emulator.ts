import { handleMessage } from './worker-utils';

export class FileStorageWorkerEmulator {
    postMessage(value: any): void {
        void handleMessage(value);
    }

    terminate(): void {}

    unref(): void {}
}
