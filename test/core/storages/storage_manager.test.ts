import { Dataset, MemoryStorageBackend, serviceLocator } from '@crawlee/core';

beforeEach(async () => {
    serviceLocator.setStorageBackend(new MemoryStorageBackend());
});

describe('StorageManager', () => {
    test('failed openStorage call does not block subsequent calls (#3661)', async () => {
        const goodBackend = serviceLocator.getStorageBackend();
        const failingBackend = {
            ...goodBackend,
            createDatasetBackend: () => {
                throw new Error('boom');
            },
        };

        await expect(Dataset.open('will-fail', { storageBackend: failingBackend as any })).rejects.toThrow('boom');

        await expect(
            Promise.race([
                Dataset.open('fallback'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
            ]),
        ).resolves.toBeDefined();
    });
});
