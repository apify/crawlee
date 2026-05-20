import { Configuration, Dataset } from '@crawlee/core';

import { MemoryStorageEmulator } from '../../shared/MemoryStorageEmulator';

const localStorageEmulator = new MemoryStorageEmulator();

beforeEach(async () => {
    await localStorageEmulator.init();
});

afterAll(async () => {
    await localStorageEmulator.destroy();
});

describe('StorageManager', () => {
    test('failed openStorage call does not block subsequent calls (#3661)', async () => {
        const goodClient = Configuration.getStorageClient();
        const failingClient = {
            ...goodClient,
            datasets: () => {
                throw new Error('boom');
            },
            dataset: () => {
                throw new Error('boom');
            },
        };

        await expect(Dataset.open('will-fail', { storageClient: failingClient as any })).rejects.toThrow('boom');

        await expect(
            Promise.race([
                Dataset.open('fallback'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
            ]),
        ).resolves.toBeDefined();
    });
});
