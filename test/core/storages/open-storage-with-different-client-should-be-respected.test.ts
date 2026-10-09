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

        // The queue was opened without an explicit backend, so it must live in the one the service
        // locator hands out - and nowhere else.
        await expect(newClient.storageExists(queue.id, 'RequestQueue')).resolves.toBe(true);
        await expect(new MemoryStorageBackend().storageExists(queue.id, 'RequestQueue')).resolves.toBe(false);
    });

    test('opening a RequestQueue with a different client', async () => {
        const thirdClient = new MemoryStorageBackend();

        const queue = await RequestQueue.open({ name: 'test-rq-open-custom-client' }, { storageBackend: thirdClient });

        await expect(thirdClient.storageExists(queue.id, 'RequestQueue')).resolves.toBe(true);
        await expect(newClient.storageExists(queue.id, 'RequestQueue')).resolves.toBe(false);
    });
});
