import { rm } from 'node:fs/promises';

import { serviceLocator } from '@crawlee/core';

export abstract class StorageEmulator {
    protected localStorageDirectories: string[] = [];

    async init(options?: Record<PropertyKey, any>): Promise<void> {
        serviceLocator.clearStorageManagerCache();
    }

    async destroy() {
        const promises = this.localStorageDirectories.map(async (dir) => {
            return rm(dir, { force: true, recursive: true });
        });

        await Promise.all(promises);
        serviceLocator.clearStorageManagerCache();
    }
}
