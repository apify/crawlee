import { Dataset, MemoryStorageBackend, serviceLocator } from '@crawlee/core';

beforeEach(async () => {
    serviceLocator.setStorageBackend(new MemoryStorageBackend());
});

describe('StorageManager', () => {
    test('failed openStorage call does not block subsequent calls (#3661)', async () => {
        // A real instance, so every method the open path calls (`purge`, `getStorageBackendCacheKey`)
        // operates on its own state - only the failing call is stubbed.
        const failingBackend = Object.assign(new MemoryStorageBackend(), {
            createDatasetBackend: () => {
                throw new Error('boom');
            },
        });

        await expect(Dataset.open('will-fail', { storageBackend: failingBackend as any })).rejects.toThrow('boom');

        await expect(
            Promise.race([
                Dataset.open('fallback'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
            ]),
        ).resolves.toBeDefined();
    });
});
