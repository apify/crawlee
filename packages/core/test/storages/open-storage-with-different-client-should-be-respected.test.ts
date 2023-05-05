import { MemoryStorage } from '@crawlee/memory-storage';
import { Configuration, RequestQueue } from 'crawlee';

const originalClient = Configuration.getStorageClient();
const newClient = new MemoryStorage({ persistStorage: false, writeMetadata: false });
Configuration.useStorageClient(newClient);

afterAll(() => {
    Configuration.useStorageClient(originalClient);
});

describe('Opening a storage with a different storage client should be respected', () => {
    test('opening a RequestQueue with default client from Configuration', async () => {
        const queue = await RequestQueue.open('test-rq-open-client-from-config');

        expect((queue.client as any).client).toBe(newClient);
    });

    test('opening a RequestQueue with a different client', async () => {
        const thirdClient = new MemoryStorage({ persistStorage: false, writeMetadata: false });
        // @ts-expect-error Using this to ensure the test/impl works
        thirdClient._name = 'third-client';

        const queue = await RequestQueue.open('test-rq-open-custom-client', { storageClient: thirdClient });

        expect((queue.client as any).client).toBe(thirdClient);
    });
});
