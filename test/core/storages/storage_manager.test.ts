import { Dataset, MemoryStorageBackend, serviceLocator } from '@crawlee/core';

beforeEach(async () => {
    serviceLocator.setStorageBackend(new MemoryStorageBackend());
});

describe('StorageManager', () => {
    test('failed openStorage call does not block subsequent calls (#3661)', async () => {
        const goodBackend = serviceLocator.getStorageBackend();
        // Delegate to the real backend via the prototype chain so the mock still satisfies
        // the StorageBackend interface validation.
        const failingBackend = Object.assign(Object.create(goodBackend), {
            createDatasetBackend: () => {
                throw new Error('boom');
            },
            // The inherited method reads a private field that only the real instance carries.
            getStorageBackendCacheKey: () => 'FailingBackend',
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
