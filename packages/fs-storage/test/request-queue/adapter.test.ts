import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';
import type { RequestQueueBackend } from '@crawlee/types';

// The request-queue ordering, locking and finished-ness semantics are owned (and exhaustively tested)
// by the native `@crawlee/fs-storage-native` extension. These tests cover what the *adapter* adds on
// top: mapping requests and operation results between the native shapes and the `@crawlee/types`
// interfaces, and a thin lifecycle smoke test to catch wiring regressions.
describe('RequestQueueBackend adapter', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/adapter');

    let requestQueue: RequestQueueBackend;
    let testIndex = 0;

    beforeEach(async () => {
        // Isolate each test with its own storage directory and queue so persisted counts/requests from
        // one test cannot leak into the next.
        const storage = new FileSystemStorageBackend({ localDataDirectory: resolve(tmpLocation, `${testIndex++}`) });
        requestQueue = await storage.createRequestQueueBackend({ name: 'adapter' });
    });

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('fetchNextRequest returns a request with its fields preserved', async () => {
        await requestQueue.addBatchOfRequests([
            { url: 'http://example.com/1', uniqueKey: '1', userData: { foo: 'bar' } },
        ]);

        const request = await requestQueue.fetchNextRequest();

        expect(request).toBeDefined();
        expect(request!.url).toBe('http://example.com/1');
        expect(request!.uniqueKey).toBe('1');
        expect(request!.userData).toStrictEqual({ foo: 'bar' });
        // `id` is a real request field and is surfaced.
        expect(typeof request!.id).toBe('string');
    });

    test('preserves non-enumerable `userData.__crawlee` metadata across the native round-trip', async () => {
        // Regression guard for a bug where `crawlDepth` (and other internal metadata living in the
        // non-enumerable `userData.__crawlee` bag) was silently dropped when a request was handed to the
        // native client, resetting `crawlDepth` to 0 on the next fetch and breaking `maxCrawlDepth` /
        // enqueue-strategy handling. The native client reads enumerable own properties over N-API and
        // does not honor `toJSON`, so the adapter must flatten the request before persisting it.
        const requestWithHiddenMetadata: Record<string, unknown> = {
            url: 'http://example.com/1',
            uniqueKey: '1',
            userData: {},
        };
        // Mirror how Crawlee's `Request` stores internal metadata: in a *non-enumerable* `__crawlee` bag
        // with a `toJSON` that surfaces it. A naive pass-through to the native client would lose this.
        Object.defineProperty(requestWithHiddenMetadata.userData, '__crawlee', {
            value: { crawlDepth: 3, enqueueStrategy: 'same-domain' },
            enumerable: false,
        });
        Object.defineProperty(requestWithHiddenMetadata.userData, 'toJSON', {
            value() {
                return { __crawlee: (this as any).__crawlee };
            },
            enumerable: false,
        });

        await requestQueue.addBatchOfRequests([requestWithHiddenMetadata as any]);

        const request = await requestQueue.fetchNextRequest();

        expect(request!.userData).toStrictEqual({ __crawlee: { crawlDepth: 3, enqueueStrategy: 'same-domain' } });
    });

    test('getRequest looks up by uniqueKey', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        const request = await requestQueue.getRequest('1');

        expect(request?.url).toBe('http://example.com/1');
        expect(await requestQueue.getRequest('does-not-exist')).toBeUndefined();
    });

    test('addBatchOfRequests maps the native response into BatchAddRequestsResult', async () => {
        const result = await requestQueue.addBatchOfRequests([
            { url: 'http://example.com/1', uniqueKey: '1' },
            { url: 'http://example.com/1', uniqueKey: '1' }, // duplicate uniqueKey
        ]);

        expect(result.unprocessedRequests).toStrictEqual([]);
        expect(result.processedRequests).toHaveLength(2);

        const [first, second] = result.processedRequests;
        expect(first).toMatchObject({ uniqueKey: '1', wasAlreadyPresent: false, wasAlreadyHandled: false });
        expect(typeof first.requestId).toBe('string');
        // The second one is deduplicated by uniqueKey.
        expect(second).toMatchObject({ uniqueKey: '1', wasAlreadyPresent: true });
    });

    test('markRequestAsHandled maps the native result into QueueOperationInfo', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);
        const request = await requestQueue.fetchNextRequest();

        const info = await requestQueue.markRequestAsHandled({ ...request!, id: request!.id! });

        expect(info).toMatchObject({ requestId: request!.id, wasAlreadyHandled: true, wasAlreadyPresent: true });
    });

    test('getMetadata maps native metadata into RequestQueueInfo (Date timestamps, counts)', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);
        const request = await requestQueue.fetchNextRequest();
        await requestQueue.markRequestAsHandled({ ...request!, id: request!.id! });

        const metadata = await requestQueue.getMetadata();

        // Native count fields are surfaced...
        expect(metadata.handledRequestCount).toBe(1);
        expect(metadata.pendingRequestCount).toBe(0);
        expect(metadata.totalRequestCount).toBe(1);
        // ...ISO-string timestamps are converted to `Date`...
        expect(metadata.createdAt).toBeInstanceOf(Date);
        expect(metadata.modifiedAt).toBeInstanceOf(Date);
        expect(metadata.accessedAt).toBeInstanceOf(Date);
        // ...and the adapter synthesizes the framework-shape fields.
        expect(metadata.id).toEqual(expect.any(String));
    });

    test('a request added as already-handled counts toward handledRequestCount', async () => {
        // Regression guard: re-inserting an already-handled request must not be counted as pending.
        await requestQueue.addBatchOfRequests([
            { url: 'http://example.com/1', uniqueKey: '1', handledAt: new Date().toISOString() },
        ]);

        const metadata = await requestQueue.getMetadata();
        expect(metadata.handledRequestCount).toBe(1);
        expect(metadata.pendingRequestCount).toBe(0);
    });

    test('forwards `forefront` so a later request can be served first', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/2', uniqueKey: '2' }], { forefront: true });

        // We only assert that the `forefront` flag reaches the native client (the forefront request is
        // served before the regular one); the exact ordering algorithm is the native client's concern.
        const first = await requestQueue.fetchNextRequest();
        expect(first!.uniqueKey).toBe('2');
    });

    test('lifecycle: fetch marks in-progress, handle empties and finishes the queue', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);
        expect(await requestQueue.isEmpty()).toBe(false);

        const request = await requestQueue.fetchNextRequest();
        // Fetched (in-progress): nothing left to fetch, but not finished until handled.
        expect(await requestQueue.isEmpty()).toBe(true);
        expect(await requestQueue.isFinished()).toBe(false);
        // While in progress it is not handed out again.
        expect(await requestQueue.fetchNextRequest()).toBeUndefined();

        await requestQueue.markRequestAsHandled({ ...request!, id: request!.id! });
        expect(await requestQueue.isFinished()).toBe(true);
    });

    test('reclaimRequest returns an in-progress request to the queue', async () => {
        await requestQueue.addBatchOfRequests([{ url: 'http://example.com/1', uniqueKey: '1' }]);

        const first = await requestQueue.fetchNextRequest();
        const info = await requestQueue.reclaimRequest({ ...first!, id: first!.id! });
        expect(info).toMatchObject({ requestId: first!.id, wasAlreadyHandled: false });

        const again = await requestQueue.fetchNextRequest();
        expect(again!.uniqueKey).toBe('1');
    });
});
