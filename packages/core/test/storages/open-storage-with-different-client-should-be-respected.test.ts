import { MemoryStorageBackend } from '@crawlee/core';
import { RequestQueue, serviceLocator } from 'crawlee';

let newClient: MemoryStorageBackend;

beforeEach(() => {
    newClient = new MemoryStorageBackend();
    serviceLocator.setStorageBackend(newClient);
});

describe('Opening a storage with a different storage backend should be respected', () => {
    test('opening a RequestQueue with default client from Configuration', async () => {
        const queue = await RequestQueue.open({ name: 'test-rq-open-client-from-config' });

        // The sub-client should have been created by newClient (MemoryStorageBackend),
        // so its internal `client` field should reference newClient.
        expect((queue.client as any).client).toBe(newClient);
    });

    test('opening a RequestQueue with a different client', async () => {
        const thirdClient = new MemoryStorageBackend();
        // @ts-expect-error Using this to ensure the test/impl works
        thirdClient._name = 'third-client';

        const queue = await RequestQueue.open({ name: 'test-rq-open-custom-client' }, { storageBackend: thirdClient });

        expect((queue.client as any).client).toBe(thirdClient);
    });
});
