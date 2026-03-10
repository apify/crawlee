/**
 * Integration tests for @crawlee/redis-storage
 *
 * These tests require a running Redis instance. Set the REDIS_URL environment
 * variable (default: redis://localhost:6379) before running.
 *
 * Run:
 *   REDIS_URL=redis://localhost:6379 yarn vitest run packages/redis-storage/test
 */

import { randomUUID } from 'node:crypto';

import type { Redis } from 'ioredis';
import IoRedis from 'ioredis';

import { RedisRequestQueueClient } from '@crawlee/redis-storage';
import { RedisRequestQueueCollectionClient } from '@crawlee/redis-storage';
import { RedisStorageClient } from '@crawlee/redis-storage';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueueId() {
    return `test-${randomUUID().slice(0, 8)}`;
}

async function initQueueMeta(redis: Redis, queueId: string): Promise<void> {
    await redis.hset(`rq:${queueId}:meta`, {
        id: queueId,
        name: `queue-${queueId}`,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        accessedAt: new Date().toISOString(),
        totalRequestCount: '0',
        handledRequestCount: '0',
        hadMultipleClients: 'false',
    });
}

async function cleanQueue(redis: Redis, queueId: string): Promise<void> {
    const keys = await redis.keys(`rq:${queueId}*`);
    if (keys.length > 0) await redis.del(...keys);
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('RedisRequestQueueClient', () => {
    let redis: Redis;
    let queueId: string;
    let client: RedisRequestQueueClient;

    beforeAll(() => {
        redis = new IoRedis(REDIS_URL);
    });

    afterAll(async () => {
        await redis.quit();
    });

    beforeEach(async () => {
        queueId = makeQueueId();
        await initQueueMeta(redis, queueId);
        client = new RedisRequestQueueClient(redis, queueId);
    });

    afterEach(async () => {
        await cleanQueue(redis, queueId);
    });

    // ── get / update / delete ────────────────────────────────────────────────

    test('get() returns queue info', async () => {
        const info = await client.get();
        expect(info).toBeDefined();
        expect(info!.id).toBe(queueId);
        expect(info!.totalRequestCount).toBe(0);
        expect(info!.handledRequestCount).toBe(0);
        expect(info!.pendingRequestCount).toBe(0);
    });

    test('get() returns undefined for non-existent queue', async () => {
        const other = new RedisRequestQueueClient(redis, `no-such-${randomUUID()}`);
        expect(await other.get()).toBeUndefined();
    });

    test('update() changes the name', async () => {
        const updated = await client.update({ name: 'new-name' });
        expect(updated!.name).toBe('new-name');
    });

    test('delete() removes all queue keys', async () => {
        await client.addRequest({ url: 'https://example.com/1', uniqueKey: 'uk-1' });
        await client.delete();
        const keys = await redis.keys(`rq:${queueId}*`);
        expect(keys).toHaveLength(0);
    });

    // ── addRequest ───────────────────────────────────────────────────────────

    test('addRequest() enqueues a new request', async () => {
        const result = await client.addRequest({ url: 'https://example.com', uniqueKey: 'uk-add-1' });
        expect(result.wasAlreadyPresent).toBe(false);
        expect(result.wasAlreadyHandled).toBe(false);
        expect(result.requestId).toBeTruthy();

        const stored = await redis.hgetall(`rq:${queueId}:data:${result.requestId}`);
        expect(stored.url).toBe('https://example.com');
        expect(stored.uniqueKey).toBe('uk-add-1');
    });

    test('addRequest() deduplicates by uniqueKey', async () => {
        const r1 = await client.addRequest({ url: 'https://a.com', uniqueKey: 'dedup-key' });
        const r2 = await client.addRequest({ url: 'https://b.com', uniqueKey: 'dedup-key' });

        expect(r1.wasAlreadyPresent).toBe(false);
        expect(r2.wasAlreadyPresent).toBe(true);
        expect(r2.requestId).toBe(r1.requestId);
    });

    test('addRequest() with forefront places request at the front', async () => {
        await client.addRequest({ url: 'https://example.com/1', uniqueKey: 'order-1' });
        await client.addRequest({ url: 'https://example.com/2', uniqueKey: 'order-2' });
        await client.addRequest({ url: 'https://example.com/0', uniqueKey: 'order-0' }, { forefront: true });

        const head = await client.listHead({ limit: 3 });
        expect(head.items[0].url).toBe('https://example.com/0');
    });

    test('addRequest() persists userData as JSON', async () => {
        const result = await client.addRequest({
            url: 'https://example.com',
            uniqueKey: 'ud-1',
            userData: { foo: 'bar', n: 42 },
        });
        const req = await client.getRequest(result.requestId);
        expect((req as any).userData).toEqual({ foo: 'bar', n: 42 });
    });

    // ── batchAddRequests ─────────────────────────────────────────────────────

    test('batchAddRequests() adds multiple requests', async () => {
        const result = await client.batchAddRequests([
            { url: 'https://example.com/a', uniqueKey: 'batch-a' },
            { url: 'https://example.com/b', uniqueKey: 'batch-b' },
            { url: 'https://example.com/c', uniqueKey: 'batch-c' },
        ]);

        expect(result.processedRequests).toHaveLength(3);
        expect(result.unprocessedRequests).toHaveLength(0);
        expect(result.processedRequests.every((r) => !r.wasAlreadyPresent)).toBe(true);

        const info = await client.get();
        expect(info!.totalRequestCount).toBe(3);
    });

    test('batchAddRequests() deduplicates within the batch', async () => {
        await client.addRequest({ url: 'https://example.com/a', uniqueKey: 'batch-dup-a' });

        const result = await client.batchAddRequests([
            { url: 'https://example.com/a', uniqueKey: 'batch-dup-a' }, // duplicate
            { url: 'https://example.com/b', uniqueKey: 'batch-dup-b' }, // new
        ]);

        const dup = result.processedRequests.find((r) => r.uniqueKey === 'batch-dup-a')!;
        const fresh = result.processedRequests.find((r) => r.uniqueKey === 'batch-dup-b')!;

        expect(dup.wasAlreadyPresent).toBe(true);
        expect(fresh.wasAlreadyPresent).toBe(false);
    });

    test('batchAddRequests() returns empty result for empty input', async () => {
        const result = await client.batchAddRequests([]);
        expect(result.processedRequests).toHaveLength(0);
        expect(result.unprocessedRequests).toHaveLength(0);
    });

    // ── getRequest / updateRequest / deleteRequest ───────────────────────────

    test('getRequest() returns the stored request', async () => {
        const { requestId } = await client.addRequest({
            url: 'https://example.com/get',
            uniqueKey: 'get-req',
            headers: { 'x-foo': 'bar' },
        });

        const req = await client.getRequest(requestId);
        expect(req).toBeDefined();
        expect((req as any).url).toBe('https://example.com/get');
        expect((req as any).headers).toEqual({ 'x-foo': 'bar' });
    });

    test('getRequest() returns undefined for unknown id', async () => {
        expect(await client.getRequest('no-such-id')).toBeUndefined();
    });

    test('updateRequest() marks request as handled', async () => {
        const { requestId } = await client.addRequest({ url: 'https://example.com/upd', uniqueKey: 'upd-1' });

        await client.updateRequest({
            id: requestId,
            url: 'https://example.com/upd',
            uniqueKey: 'upd-1',
            handledAt: new Date().toISOString(),
        });

        const info = await client.get();
        expect(info!.handledRequestCount).toBe(1);

        // Should no longer be in pending
        const pendingIds = await redis.zrange(`rq:${queueId}:pending`, 0, -1);
        expect(pendingIds).not.toContain(requestId);
    });

    test('updateRequest() with forefront re-scores in pending', async () => {
        await client.addRequest({ url: 'https://example.com/1', uniqueKey: 'fore-1' });
        const { requestId } = await client.addRequest({ url: 'https://example.com/2', uniqueKey: 'fore-2' });

        await client.updateRequest(
            { id: requestId, url: 'https://example.com/2', uniqueKey: 'fore-2' },
            { forefront: true },
        );

        const head = await client.listHead({ limit: 2 });
        expect(head.items[0].url).toBe('https://example.com/2');
    });

    test('deleteRequest() removes the request', async () => {
        const { requestId } = await client.addRequest({ url: 'https://example.com/del', uniqueKey: 'del-1' });
        await client.deleteRequest(requestId);

        expect(await client.getRequest(requestId)).toBeUndefined();
        const pendingIds = await redis.zrange(`rq:${queueId}:pending`, 0, -1);
        expect(pendingIds).not.toContain(requestId);
    });

    // ── listAndLockHead / prolongRequestLock / deleteRequestLock ────────────

    test('listAndLockHead() locks requests and returns them', async () => {
        await client.addRequest({ url: 'https://example.com/lock-1', uniqueKey: 'lock-1' });
        await client.addRequest({ url: 'https://example.com/lock-2', uniqueKey: 'lock-2' });

        const result = await client.listAndLockHead({ limit: 2, lockSecs: 30 });

        expect(result.items).toHaveLength(2);
        expect(result.queueHasLockedRequests).toBe(true);

        const lockedIds = await redis.zrange(`rq:${queueId}:locked`, 0, -1);
        expect(lockedIds).toHaveLength(2);

        // Pending should now be empty
        const pendingIds = await redis.zrange(`rq:${queueId}:pending`, 0, -1);
        expect(pendingIds).toHaveLength(0);
    });

    test('listAndLockHead() recovers expired locks to pending', async () => {
        await client.addRequest({ url: 'https://example.com/exp-1', uniqueKey: 'exp-1' });

        // Lock with a lock that expired 1 second ago
        const pastExpiry = Math.floor(Date.now() / 1_000) - 1;
        const reqId = (await redis.zrange(`rq:${queueId}:pending`, 0, 0))[0];
        await redis.zrem(`rq:${queueId}:pending`, reqId);
        await redis.zadd(`rq:${queueId}:locked`, 1, reqId);
        await redis.hset(`rq:${queueId}:lockExpiry`, reqId, String(pastExpiry));

        // listAndLockHead should recover the expired lock
        const result = await client.listAndLockHead({ limit: 5, lockSecs: 30 });
        expect(result.items.some((i) => i.id === reqId)).toBe(true);
    });

    test('prolongRequestLock() extends the lock expiry', async () => {
        await client.addRequest({ url: 'https://example.com/prolong', uniqueKey: 'prolong-1' });
        const { items } = await client.listAndLockHead({ limit: 1, lockSecs: 10 });
        const item = items[0];

        const result = await client.prolongRequestLock(item.id, { lockSecs: 60 });
        const nowSec = Math.floor(Date.now() / 1_000);
        expect(result.lockExpiresAt.getTime() / 1_000).toBeGreaterThanOrEqual(nowSec + 59);
    });

    test('deleteRequestLock() moves request back to pending', async () => {
        await client.addRequest({ url: 'https://example.com/unlock', uniqueKey: 'unlock-1' });
        const { items } = await client.listAndLockHead({ limit: 1, lockSecs: 30 });
        const item = items[0];

        await client.deleteRequestLock(item.id);

        const lockedIds = await redis.zrange(`rq:${queueId}:locked`, 0, -1);
        expect(lockedIds).not.toContain(item.id);

        const pendingIds = await redis.zrange(`rq:${queueId}:pending`, 0, -1);
        expect(pendingIds).toContain(item.id);
    });

    test('deleteRequestLock() with forefront places request at front of pending', async () => {
        await client.addRequest({ url: 'https://example.com/a', uniqueKey: 'rf-a' });
        await client.addRequest({ url: 'https://example.com/b', uniqueKey: 'rf-b' });
        const { items } = await client.listAndLockHead({ limit: 1, lockSecs: 30 });
        const item = items[0]; // should be "a" (first inserted)

        await client.deleteRequestLock(item.id, { forefront: true });

        const head = await client.listHead({ limit: 2 });
        expect(head.items[0].id).toBe(item.id);
    });
});

// ---------------------------------------------------------------------------

describe('RedisRequestQueueCollectionClient', () => {
    let redis: Redis;
    let collectionClient: RedisRequestQueueCollectionClient;

    beforeAll(() => {
        redis = new IoRedis(REDIS_URL);
    });

    afterAll(async () => {
        await redis.quit();
    });

    beforeEach(() => {
        collectionClient = new RedisRequestQueueCollectionClient(redis);
    });

    afterEach(async () => {
        // Clean up test queues created in each test
        const registryKeys = await redis.keys('rq:registry*');
        if (registryKeys.length > 0) await redis.del(...registryKeys);
    });

    test('getOrCreate() creates a new queue', async () => {
        const name = `test-queue-${randomUUID().slice(0, 8)}`;
        const info = await collectionClient.getOrCreate(name);

        expect(info.id).toBeTruthy();
        expect(info.name).toBe(name);
        expect(info.totalRequestCount).toBe(0);
        expect(info.handledRequestCount).toBe(0);

        // Verify queue meta was also written
        const meta = await redis.hgetall(`rq:${info.id}:meta`);
        expect(meta.id).toBe(info.id);
    });

    test('getOrCreate() returns the same queue on repeated calls', async () => {
        const name = `test-queue-${randomUUID().slice(0, 8)}`;
        const first = await collectionClient.getOrCreate(name);
        const second = await collectionClient.getOrCreate(name);

        expect(second.id).toBe(first.id);
    });

    test('list() includes previously created queues', async () => {
        const name = `test-queue-${randomUUID().slice(0, 8)}`;
        await collectionClient.getOrCreate(name);

        const listed = await collectionClient.list();
        const found = listed.items.find((q) => q.name === name);
        expect(found).toBeDefined();
    });
});

// ---------------------------------------------------------------------------

describe('RedisStorageClient', () => {
    let redis: Redis;
    let storageClient: RedisStorageClient;

    beforeAll(() => {
        redis = new IoRedis(REDIS_URL);
    });

    afterAll(async () => {
        await redis.quit();
    });

    beforeEach(() => {
        storageClient = new RedisStorageClient(redis, { persistStorage: false });
    });

    afterEach(async () => {
        const registryKeys = await redis.keys('rq:registry*');
        if (registryKeys.length > 0) await redis.del(...registryKeys);
    });

    test('requestQueues().getOrCreate() creates a Redis-backed queue', async () => {
        const name = `integration-${randomUUID().slice(0, 8)}`;
        const info = await storageClient.requestQueues().getOrCreate(name);

        expect(info.id).toBeTruthy();
        expect(info.name).toBe(name);
    });

    test('requestQueue() enqueues and retrieves a request', async () => {
        const { id } = await storageClient.requestQueues().getOrCreate(`intg-${randomUUID().slice(0, 8)}`);
        const queueClient = storageClient.requestQueue(id);

        const addResult = await queueClient.addRequest({
            url: 'https://crawlee.dev',
            uniqueKey: 'crawlee-home',
        });
        expect(addResult.wasAlreadyPresent).toBe(false);

        const req = await queueClient.getRequest(addResult.requestId);
        expect((req as any).url).toBe('https://crawlee.dev');

        // Cleanup
        await redis.del(...(await redis.keys(`rq:${id}*`)));
    });
});
