/* eslint-disable dot-notation */
import { MemoryStorage } from '@crawlee/memory-storage';
import type { ListAndLockHeadResult, ListAndLockOptions, ListOptions, ProlongRequestLockOptions, ProlongRequestLockResult, QueueHead } from '@crawlee/types';
import { RequestQueueV2 } from 'crawlee';

const storage = new MemoryStorage({ persistStorage: false, writeMetadata: false });

async function makeQueue(name: string, numOfRequestsToAdd = 0) {
    const queueData = await storage.requestQueues().getOrCreate(name);

    const queue = new RequestQueueV2({ id: queueData.id, client: storage });

    if (numOfRequestsToAdd) {
        await queue.addRequests(
            Array.from(
                { length: numOfRequestsToAdd },
                (_, i) => ({ url: 'https://example.com', uniqueKey: `${i}` }),
            ),
        );
    }

    return queue;
}

describe('RequestQueueV2#isFinished should use listHead instead of listAndLock', () => {
    let queue: RequestQueueV2;
    let clientListHeadSpy: jest.SpyInstance<Promise<QueueHead>, [options?: ListOptions | undefined], any>;
    let listHeadCallCount = 0;
    let clientListAndLockHeadSpy: jest.SpyInstance<Promise<ListAndLockHeadResult>, [options: ListAndLockOptions], any>;
    let listAndLockHeadCallCount = 0;
    let lockResult: ListAndLockHeadResult;

    beforeAll(async () => {
        queue = await makeQueue('is-finished', 2);
        clientListHeadSpy = jest.spyOn(queue.client, 'listHead');
        clientListAndLockHeadSpy = jest.spyOn(queue.client, 'listAndLockHead');
    });

    test('should return false if there are still requests in the queue', async () => {
        expect(await queue.isFinished()).toBe(false);
        expect(clientListHeadSpy).toHaveBeenCalledTimes(++listHeadCallCount);
    });

    test('should return false even if all requests are locked', async () => {
        lockResult = await queue.client.listAndLockHead({ lockSecs: 60 });

        expect(lockResult.items.length).toBe(2);
        expect(clientListAndLockHeadSpy).toHaveBeenCalledTimes(++listAndLockHeadCallCount);

        expect(await queue.isFinished()).toBe(false);
        expect(clientListHeadSpy).toHaveBeenCalledTimes(++listHeadCallCount);
        expect(clientListAndLockHeadSpy).toHaveBeenCalledTimes(listAndLockHeadCallCount);
    });
});

describe('RequestQueueV2#isFinished should return true once locked requests are handled', () => {
    let queue: RequestQueueV2;
    let clientListHeadSpy: jest.SpyInstance<Promise<QueueHead>, [options?: ListOptions | undefined], any>;
    let listHeadCallCount = 0;
    let clientListAndLockHeadSpy: jest.SpyInstance<Promise<ListAndLockHeadResult>, [options: ListAndLockOptions], any>;
    let lockResult: ListAndLockHeadResult;

    beforeAll(async () => {
        queue = await makeQueue('is-finished-locked', 1);
        clientListHeadSpy = jest.spyOn(queue.client, 'listHead');
        clientListAndLockHeadSpy = jest.spyOn(queue.client, 'listAndLockHead');

        lockResult = await queue.client.listAndLockHead({ lockSecs: 60 });
        queue['inProgress'].add(lockResult.items[0].id);
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
        expect(clientListAndLockHeadSpy).toHaveBeenCalledTimes(1);
    });
});

describe('RequestQueueV2#fetchNextRequest should use locking API', () => {
    let queue: RequestQueueV2;
    let clientListHeadSpy: jest.SpyInstance<Promise<QueueHead>, [options?: ListOptions | undefined], any>;
    let clientListAndLockHeadSpy: jest.SpyInstance<Promise<ListAndLockHeadResult>, [options: ListAndLockOptions], any>;
    let clientProlongLockSpy: jest.SpyInstance<Promise<ProlongRequestLockResult>, [id: string, options: ProlongRequestLockOptions], any>;
    let listAndLockHeadCallCount = 0;

    beforeAll(async () => {
        queue = await makeQueue('fetch-next-request', 1);
        clientListHeadSpy = jest.spyOn(queue.client, 'listHead');
        clientListAndLockHeadSpy = jest.spyOn(queue.client, 'listAndLockHead');
        clientProlongLockSpy = jest.spyOn(queue.client, 'prolongRequestLock');
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
    let clientListHeadSpy: jest.SpyInstance<Promise<QueueHead>, [options?: ListOptions | undefined], any>;
    let clientListAndLockHeadSpy: jest.SpyInstance<Promise<ListAndLockHeadResult>, [options: ListAndLockOptions], any>;
    let lockResult: ListAndLockHeadResult;

    beforeAll(async () => {
        queue = await makeQueue('is-empty-vs-is-finished', 1);
        clientListHeadSpy = jest.spyOn(queue.client, 'listHead');
        clientListAndLockHeadSpy = jest.spyOn(queue.client, 'listAndLockHead');

        lockResult = await queue.client.listAndLockHead({ lockSecs: 60 });
        queue['inProgress'].add(lockResult.items[0].id);
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
