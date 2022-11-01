import { rm } from 'node:fs/promises';
import { StorageManager } from '@crawlee/core';

export abstract class StorageEmulator {
    protected localStorageDirectories: string[] = [];

    async init(options?: Record<PropertyKey, any>): Promise<void> {
        StorageManager.clearCache();
    }

    async destroy() {
        const promises = this.localStorageDirectories.map((dir) => {
            return rm(dir, { force: true, recursive: true });
        });

        await Promise.all(promises);
        StorageManager.clearCache();
    }
}
