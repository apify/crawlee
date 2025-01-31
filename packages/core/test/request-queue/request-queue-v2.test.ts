import { MemoryStorage } from '@crawlee/memory-storage';
import type { ListAndLockHeadResult } from '@crawlee/types';
import { RequestQueueV2 } from 'crawlee';
import type { MockInstance } from 'vitest';

const storage = new MemoryStorage({ persistStorage: false, writeMetadata: false });

async function makeQueue(name: string, numOfRequestsToAdd = 0) {
    const queueData = await storage.requestQueues().getOrCreate(name);

    const queue = new RequestQueueV2({ id: queueData.id, client: storage });

    if (numOfRequestsToAdd) {
        await queue.addRequests(
            Array.from({ length: numOfRequestsToAdd }, (_, i) => ({ url: 'https://example.com', uniqueKey: `${i}` })),
        );
    }

    return queue;
}

vitest.setConfig({ restoreMocks: false });

describe('RequestQueueV2#isFinished should use listHead instead of listAndLock', () => {
    let queue: RequestQueueV2;
    let clientListHeadSpy: MockInstance<typeof queue.client.listHead>;

    beforeAll(async () => {
        queue = await makeQueue('is-finished', 2);
        clientListHeadSpy = vitest.spyOn(queue.client, 'listHead');
    });

    test('should return false if there are still requests in the queue', async () => {
        expect(await queue.isFinished()).toBe(false);
    });

    test('should return false even if all requests are locked', async () => {
        queue.client.listAndLockHead = async (options) => ({
            lockSecs: options.lockSecs,
            queueModifiedAt: new Date(),
            limit: 10,
            items: [],
            queueHasLockedRequests: true,
        });

        expect(await queue.isFinished()).toBe(false);
        expect(clientListHeadSpy).not.toHaveBeenCalled();
    });
});

describe('RequestQueueV2#isFinished should return true once locked requests are handled', () => {
    let queue: RequestQueueV2;
    let clientListHeadSpy: MockInstance<typeof queue.client.listHead>;
    let listHeadCallCount = 0;
    let clientListAndLockHeadSpy: MockInstance<typeof queue.client.listAndLockHead>;
    let lockResult: ListAndLockHeadResult;

    beforeAll(async () => {
        queue = await makeQueue('is-finished-locked', 1);
        clientListHeadSpy = vitest.spyOn(queue.client, 'listHead');
        clientListAndLockHeadSpy = vitest.spyOn(queue.client, 'listAndLockHead');

        lockResult = await queue.client.listAndLockHead({ lockSecs: 60 });
        // eslint-disable-next-line dot-notation
        queue['queueHeadIds'].add(lockResult.items[0].id, lockResult.items[0].id);
    });

    test('should return true once locked requests are handled', async () => {
        // Check that, when locked request isn't handled yet, it returns false
        expect(await queue.isFinished()).toBe(false);

        // Mark the locked request as handled
        await queue.markRequestHandled((await queue.getRequest(lockResult.items[0].id))!);

        // Check that, when locked request is handled, it returns true
        expect(await queue.isFinished()).toBe(true);
        expect(clientListHeadSpy).toHaveBeenCalledWith({ limit: 2 });
        expect(clientListHeadSpy).toHaveBeenCalledTimes(++listHeadCallCount);
        // One time
        expect(clientListAndLockHeadSpy).toHaveBeenCalled();
    });
});

describe('RequestQueueV2#fetchNextRequest should use locking API', () => {
    let queue: RequestQueueV2;
    let clientListHeadSpy: MockInstance<typeof queue.client.listHead>;
    let clientListAndLockHeadSpy: MockInstance<typeof queue.client.listAndLockHead>;
    let clientProlongLockSpy: MockInstance<typeof queue.client.prolongRequestLock>;
    let listAndLockHeadCallCount = 0;

    beforeAll(async () => {
        queue = await makeQueue('fetch-next-request', 1);
        clientListHeadSpy = vitest.spyOn(queue.client, 'listHead');
        clientListAndLockHeadSpy = vitest.spyOn(queue.client, 'listAndLockHead');
        clientProlongLockSpy = vitest.spyOn(queue.client, 'prolongRequestLock');
    });

    test('should return the first request', async () => {
        expect(await queue.fetchNextRequest()).not.toBe(null);

        // Check that it uses the locking API
        expect(clientListAndLockHeadSpy).toHaveBeenCalledTimes(++listAndLockHeadCallCount);
        expect(clientListHeadSpy).not.toHaveBeenCalled();

        // Check that the lock is prolonged too
        expect(clientProlongLockSpy).toHaveBeenCalled();
    });

    test('should return null when all requests are locked', async () => {
        expect(await queue.fetchNextRequest()).toBe(null);

        expect(clientListAndLockHeadSpy).toHaveBeenCalledTimes(++listAndLockHeadCallCount);
        expect(clientListHeadSpy).not.toHaveBeenCalled();
    });
});

describe('RequestQueueV2#isEmpty should return true even if isFinished returns false due to locked requests', () => {
    let queue: RequestQueueV2;
    let lockResult: ListAndLockHeadResult;

    beforeAll(async () => {
        queue = await makeQueue('is-empty-vs-is-finished', 1);
        lockResult = await queue.client.listAndLockHead({ lockSecs: 60 });
    });

    test('should return true when isFinished returns false', async () => {
        expect(await queue.isEmpty()).toBe(true);
        expect(await queue.isFinished()).toBe(false);
    });

    test('should return true when isFinished returns true', async () => {
        await queue.markRequestHandled((await queue.getRequest(lockResult.items[0].id))!);

        expect(await queue.isEmpty()).toBe(true);
        expect(await queue.isFinished()).toBe(true);
    });
});
