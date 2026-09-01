import { Readable } from 'node:stream';

import {
    createStorageTransaction,
    Dataset,
    getRequestId,
    KeyValueStore,
    MemoryStorageBackend,
    Request,
    RequestQueue,
    serviceLocator,
    withDirectStorageAccess,
    withStorageTransaction,
} from '@crawlee/core';
import { BaseHttpClient } from '@crawlee/http-client';

import { storage as timeoutStorage } from '@apify/timeout';

beforeEach(() => {
    serviceLocator.setStorageBackend(new MemoryStorageBackend());
});

describe('StorageTransaction', () => {
    describe('state machine', () => {
        test('commit applies buffered writes, rollback discards them', async () => {
            const store = await KeyValueStore.open();

            const committed = createStorageTransaction();
            await committed.run(async () => store.setValue('committed', { a: 1 }));
            await committed.commit();
            committed.dispose();

            const rolledBack = createStorageTransaction();
            await rolledBack.run(async () => store.setValue('rolled-back', { a: 1 }));
            rolledBack.rollback();
            rolledBack.dispose();

            await expect(store.getValue('committed')).resolves.toEqual({ a: 1 });
            await expect(store.getValue('rolled-back')).resolves.toBeNull();
            expect(committed.state).toBe('committed');
            expect(rolledBack.state).toBe('rolledBack');
        });

        test('rollback after a successful commit is a silent no-op', async () => {
            const store = await KeyValueStore.open();

            const transaction = createStorageTransaction();
            await transaction.run(async () => store.setValue('key', { a: 1 }));
            await transaction.commit();

            expect(() => transaction.rollback()).not.toThrow();
            expect(transaction.state).toBe('committed');
            await expect(store.getValue('key')).resolves.toEqual({ a: 1 });

            transaction.dispose();
        });

        test('double commit does not double-flush', async () => {
            const dataset = await Dataset.open();
            const pushDataSpy = vitest.spyOn(dataset.backend, 'pushData');

            const transaction = createStorageTransaction();
            await transaction.run(async () => dataset.pushData({ a: 1 }));
            await transaction.commit();
            await transaction.commit();
            transaction.dispose();

            expect(pushDataSpy).toHaveBeenCalledTimes(1);
        });

        test('a commit that throws lands in `failed` and later writes pass through', async () => {
            const dataset = await Dataset.open();
            const store = await KeyValueStore.open();
            vitest.spyOn(dataset.backend, 'pushData').mockRejectedValueOnce(new Error('backend exploded'));

            const transaction = createStorageTransaction();
            await transaction.run(async () => dataset.pushData({ a: 1 }));

            await expect(transaction.commit()).rejects.toThrow('backend exploded');
            expect(transaction.state).toBe('failed');
            expect(transaction.isActive).toBe(false);

            // Writes made inside the (still installed) scope of a failed transaction go straight to
            // real storage - e.g. an error handler running after a failed commit must not lose output.
            await transaction.run(async () => store.setValue('from-error-handler', { ok: true }));
            await expect(store.getValue('from-error-handler')).resolves.toEqual({ ok: true });

            transaction.dispose();
        });

        test('commit succeeds even when the ambient cancellation context has already been aborted', async () => {
            const store = await KeyValueStore.open();

            const transaction = createStorageTransaction();
            await transaction.run(async () => store.setValue('key', { a: 1 }));

            const controller = new AbortController();
            controller.abort();

            // Simulates a request-handler timeout that fired before commit: `tryCancel()` in the replayed
            // frontend calls would throw if commit inherited the shared, already-aborted controller.
            await timeoutStorage.run({ cancelTask: controller }, async () => {
                await transaction.commit();
            });

            expect(transaction.state).toBe('committed');
            transaction.dispose();

            await expect(store.getValue('key')).resolves.toEqual({ a: 1 });
        });
    });

    describe('scoping helpers', () => {
        test('withStorageTransaction commits on success and rolls back on throw', async () => {
            const store = await KeyValueStore.open();

            await withStorageTransaction(async () => {
                await store.setValue('success', { a: 1 });
            });

            await expect(
                withStorageTransaction(async () => {
                    await store.setValue('failure', { a: 1 });
                    throw new Error('handler failed');
                }),
            ).rejects.toThrow('handler failed');

            await expect(store.getValue('success')).resolves.toEqual({ a: 1 });
            await expect(store.getValue('failure')).resolves.toBeNull();
        });

        test('nested withStorageTransaction reuses the outer transaction', async () => {
            const store = await KeyValueStore.open();

            await withStorageTransaction(async (outer) => {
                await withStorageTransaction(async (inner) => {
                    expect(inner).toBe(outer);
                    await store.setValue('key', { a: 1 });
                });

                // The inner scope must not have committed on its own.
                const backend = (store as any).backend;
                await expect(backend.getValue('key')).resolves.toBeUndefined();
            });

            await expect(store.getValue('key')).resolves.toEqual({ a: 1 });
        });

        test('withDirectStorageAccess writes are immediate and survive rollback', async () => {
            const store = await KeyValueStore.open();

            const transaction = createStorageTransaction();
            await transaction.run(async () => {
                await withDirectStorageAccess(async () => store.setValue('direct', { a: 1 }));
                await store.setValue('buffered', { a: 1 });
            });
            transaction.rollback();
            transaction.dispose();

            await expect(store.getValue('direct')).resolves.toEqual({ a: 1 });
            await expect(store.getValue('buffered')).resolves.toBeNull();
        });
    });

    describe('isolation', () => {
        test('concurrent transactions on one frontend do not see each other; last commit wins', async () => {
            const store = await KeyValueStore.open();

            const first = createStorageTransaction();
            const second = createStorageTransaction();

            await first.run(async () => store.setValue('key', { from: 'first' }));
            await second.run(async () => {
                await expect(store.getValue('key')).resolves.toBeNull();
                await store.setValue('key', { from: 'second' });
            });
            await first.run(async () => {
                await expect(store.getValue('key')).resolves.toEqual({ from: 'first' });
            });

            await first.commit();
            await second.commit();
            first.dispose();
            second.dispose();

            await expect(store.getValue('key')).resolves.toEqual({ from: 'second' });
        });

        test('the journal is released on dispose, in every terminal state', async () => {
            const dataset = await Dataset.open();
            const store = await KeyValueStore.open();
            const queue = await RequestQueue.open();

            const transaction = createStorageTransaction({ policy: { requestQueue: 'deferred' } });
            await transaction.run(async () => {
                await dataset.pushData({ a: 1 });
                await store.setValue('key', { a: 1 });
                await queue.addRequest({ url: 'https://example.com' });
            });

            expect(transaction.journal).toHaveLength(3);

            // `failed` is the terminal state that neither `rollback()` nor an `open` check reaches -
            // dispose must release the journaled snapshots regardless of the outcome.
            vitest.spyOn(dataset.backend, 'pushData').mockRejectedValueOnce(new Error('boom'));
            await expect(transaction.commit()).rejects.toThrow('boom');
            expect(transaction.state).toBe('failed');

            transaction.dispose();

            expect(transaction.journal).toHaveLength(0);
        });
    });
});

describe('Dataset in a transaction', () => {
    test('read-your-own-writes through every read path', async () => {
        const dataset = await Dataset.open();
        await dataset.pushData({ n: 0 }); // pre-existing real item

        await withStorageTransaction(async (transaction) => {
            await dataset.pushData([{ n: 1 }, { n: 2 }]);

            const expected = [{ n: 0 }, { n: 1 }, { n: 2 }];

            await expect(dataset.getData()).resolves.toMatchObject({ total: 3, items: expected });
            await expect(dataset.export()).resolves.toEqual(expected);
            await expect(dataset.values()).resolves.toEqual(expected);
            await expect(dataset.entries()).resolves.toEqual(expected.map((item, i) => [i, item]));
            await expect(dataset.map((item) => item.n)).resolves.toEqual([0, 1, 2]);

            const iterated: unknown[] = [];
            for await (const item of dataset) {
                iterated.push(item);
            }
            expect(iterated).toEqual(expected);

            const info = await dataset.getInfo();
            expect(info.itemCount).toBe(3);

            expect(transaction.datasetItems.map(({ item }) => item)).toEqual([{ n: 1 }, { n: 2 }]);

            transaction.rollback();
        });

        // Nothing but the pre-existing item survives the rollback.
        await expect(dataset.getData()).resolves.toMatchObject({ total: 1, items: [{ n: 0 }] });
    });

    test('offset/limit/desc window across the real/buffered boundary', async () => {
        const dataset = await Dataset.open();
        await dataset.pushData([{ n: 0 }, { n: 1 }]);

        await withStorageTransaction(async (transaction) => {
            await dataset.pushData([{ n: 2 }, { n: 3 }]);

            await expect(dataset.getData({ offset: 1, limit: 2 })).resolves.toMatchObject({
                items: [{ n: 1 }, { n: 2 }],
                total: 4,
            });
            await expect(dataset.getData({ offset: 3, limit: 2 })).resolves.toMatchObject({ items: [{ n: 3 }] });
            await expect(dataset.getData({ desc: true, limit: 3 })).resolves.toMatchObject({
                items: [{ n: 3 }, { n: 2 }, { n: 1 }],
                total: 4,
            });

            transaction.rollback();
        });
    });

    test('a backend returning short pages does not pull buffered items into the real window', async () => {
        const dataset = await Dataset.open<{ n: number }>();
        await dataset.pushData(Array.from({ length: 12 }, (_, n) => ({ n })));

        // A backend honouring `skipEmpty` / `clean` / `unwind` returns fewer items than asked for while
        // the real items are far from exhausted - `total` stays honest, the page is just filtered.
        const realBackend = dataset.backend;
        dataset.backend = {
            getMetadata: async () => realBackend.getMetadata(),
            drop: async () => realBackend.drop(),
            purge: async () => realBackend.purge(),
            pushData: async (items) => realBackend.pushData(items),
            getData: async (options) => {
                const page = await realBackend.getData(options);
                const items = page.items.filter(({ n }) => ![1, 3, 5].includes(n));
                return { ...page, items, count: items.length };
            },
        };

        await withStorageTransaction(async (transaction) => {
            await dataset.pushData([{ n: 100 }, { n: 101 }]);

            // The window lies entirely within the 12 real items, so it must not reach the buffer at all -
            // deriving the buffered slice from the page's shortfall would append 100 and 101 here.
            await expect(dataset.getData({ offset: 0, limit: 5 })).resolves.toMatchObject({
                items: [{ n: 0 }, { n: 2 }, { n: 4 }],
                total: 14,
            });

            // ...and the buffer is reached exactly once, where the window really does cross into it.
            await expect(dataset.getData({ offset: 10, limit: 5 })).resolves.toMatchObject({
                items: [{ n: 10 }, { n: 11 }, { n: 100 }, { n: 101 }],
                total: 14,
            });

            transaction.rollback();
        });
    });

    test('values are captured at write time with full fidelity', async () => {
        const dataset = await Dataset.open();
        const pushDataSpy = vitest.spyOn(dataset.backend, 'pushData');

        const when = new Date('2023-01-01T00:00:00Z');
        const item: any = { when, missing: undefined, tags: new Set(['a']), n: 1 };

        await withStorageTransaction(async () => {
            await dataset.pushData(item);
            item.n = 2; // a later mutation must affect neither the read nor the commit

            const { items } = await dataset.getData();
            expect(items[0].n).toBe(1);
        });

        expect(pushDataSpy).toHaveBeenCalledTimes(1);
        const [committedItems] = pushDataSpy.mock.calls[0];
        expect(committedItems[0].when).toEqual(when);
        expect(committedItems[0].when).toBeInstanceOf(Date);
        expect(committedItems[0].tags).toEqual(new Set(['a']));
        expect('missing' in committedItems[0]).toBe(true);
        expect(committedItems[0].n).toBe(1);
    });

    test('items from multiple pushData calls are committed in order, in a single backend call', async () => {
        const dataset = await Dataset.open();
        const pushDataSpy = vitest.spyOn(dataset.backend, 'pushData');

        await withStorageTransaction(async () => {
            await dataset.pushData({ n: 1 });
            await dataset.pushData([{ n: 2 }, { n: 3 }]);
        });

        expect(pushDataSpy).toHaveBeenCalledTimes(1);
        expect(pushDataSpy).toHaveBeenCalledWith([{ n: 1 }, { n: 2 }, { n: 3 }]);
    });

    test('drop and purge are rejected inside a transaction and allowed under withDirectStorageAccess', async () => {
        const dataset = await Dataset.open();

        await withStorageTransaction(async () => {
            await expect(dataset.drop()).rejects.toThrow(/cannot be used inside a storage transaction/);
            await expect(dataset.purge()).rejects.toThrow(/cannot be used inside a storage transaction/);
            await withDirectStorageAccess(async () => dataset.drop());
        });
    });

    test('write stats count backend hits, not frontend calls', async () => {
        const dataset = await Dataset.open();

        await withStorageTransaction(async (transaction) => {
            await dataset.pushData({ n: 1 });
            transaction.rollback();
        });
        expect(dataset.stats.writeCount).toBe(0);

        await withStorageTransaction(async () => {
            await dataset.pushData({ n: 1 });
            await dataset.pushData({ n: 2 });
        });
        expect(dataset.stats.writeCount).toBe(1); // one collapsed backend call at commit
    });

    test('a merged read counts exactly one backend hit', async () => {
        const dataset = await Dataset.open();
        await dataset.pushData([{ n: 0 }, { n: 1 }]);

        await withStorageTransaction(async (transaction) => {
            await dataset.pushData({ n: 2 });

            const before = dataset.stats.readCount;
            await dataset.getData(); // real page + buffered items
            await dataset.getData({ desc: true, limit: 1 }); // buffer-only window -> getMetadata
            // Each merged read hits the backend once, counted once - not per branch, not per item.
            expect(dataset.stats.readCount - before).toBe(2);

            transaction.rollback();
        });
    });
});

describe('KeyValueStore in a transaction', () => {
    test('read-your-own-writes and collection length invariants', async () => {
        const store = await KeyValueStore.open();
        await store.setValue('real', { real: true });

        await withStorageTransaction(async (transaction) => {
            await store.setValue('buffered', { fresh: true });

            await expect(store.getValue('buffered')).resolves.toEqual({ fresh: true });
            await expect(store.recordExists('buffered')).resolves.toBe(true);

            const record = await store.getRecord('buffered');
            expect(record?.contentType).toMatch('application/json');
            expect(JSON.parse(record!.value.toString())).toEqual({ fresh: true });

            const keys = await store.keys();
            const values = await store.values();
            const entries = await store.entries();

            expect(new Set(keys)).toEqual(new Set(['real', 'buffered']));
            // A listing-only fix would pass `keys()` but lose buffered keys in `values()` / `entries()`.
            expect(values).toHaveLength(keys.length);
            expect(entries).toHaveLength(keys.length);
            expect(Object.fromEntries(entries)).toEqual({ real: { real: true }, buffered: { fresh: true } });

            const iterated: string[] = [];
            await store.forEachKey(async (key) => void iterated.push(key));
            expect(new Set(iterated)).toEqual(new Set(['real', 'buffered']));

            expect(transaction.keyValueStoreChanges[store.id]).toMatchObject({
                buffered: { changedValue: { fresh: true } },
            });

            transaction.rollback();
        });

        await expect(store.getValue('buffered')).resolves.toBeNull();
        await expect(store.getValue('real')).resolves.toEqual({ real: true });
    });

    test('listing reduces the journal a bounded number of times, not once per key', async () => {
        const store = await KeyValueStore.open();
        for (let i = 0; i < 20; i++) {
            await store.setValue(`real-${i}`, { i });
        }

        await withStorageTransaction(async (transaction) => {
            for (let i = 0; i < 20; i++) {
                await store.setValue(`buffered-${i}`, { i });
            }

            // `bufferedJournalEntries()` is the O(journal) reduction. Reading 40 keys' values must not
            // call it 40 times - the listing path builds one map and threads it through every per-key
            // read. A regression to per-key derivation makes this scale with the key count.
            const reduceSpy = vitest.spyOn(store as any, 'bufferedJournalEntries');

            const values = await store.values();
            expect(values).toHaveLength(40);

            // One reduction for the page listing, one shared across every record read: two, not forty.
            // The lower bound matters too - zero calls would mean the buffered reads were skipped entirely.
            expect(reduceSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
            expect(reduceSpy.mock.calls.length).toBeLessThanOrEqual(2);

            reduceSpy.mockRestore();
            transaction.rollback();
        });
    });

    test('deletion is a first-class tombstone', async () => {
        const store = await KeyValueStore.open();
        await store.setValue('doomed', { alive: true });

        await withStorageTransaction(async (transaction) => {
            await store.setValue('doomed', null);

            await expect(store.getValue('doomed')).resolves.toBeNull();
            await expect(store.recordExists('doomed')).resolves.toBe(false);
            await expect(store.keys()).resolves.not.toContain('doomed');

            transaction.rollback();
        });

        // The rollback discarded the tombstone.
        await expect(store.getValue('doomed')).resolves.toEqual({ alive: true });

        await withStorageTransaction(async () => {
            await store.setValue('doomed', null);
        });

        // The committed tombstone deleted the record for real.
        await expect(store.getValue('doomed')).resolves.toBeNull();
    });

    test('prefix filtering applies to buffered keys too', async () => {
        const store = await KeyValueStore.open();
        await store.setValue('match-real', 1);

        await withStorageTransaction(async (transaction) => {
            await store.setValue('match-buffered', 2);
            await store.setValue('other', 3);

            const keys = await store.keys({ prefix: 'match-' });
            expect(new Set(keys)).toEqual(new Set(['match-real', 'match-buffered']));

            transaction.rollback();
        });
    });

    test('the last write per key wins at commit', async () => {
        const store = await KeyValueStore.open();
        const backend = (store as any).backend;
        const setValueSpy = vitest.spyOn(backend, 'setValue');

        await withStorageTransaction(async () => {
            await store.setValue('key', { version: 1 });
            await store.setValue('key', { version: 2 });
        });

        expect(setValueSpy).toHaveBeenCalledTimes(1);
        await expect(store.getValue('key')).resolves.toEqual({ version: 2 });
    });

    test('stream values are rejected inside a transaction, allowed with direct access', async () => {
        const store = await KeyValueStore.open();

        await withStorageTransaction(async () => {
            await expect(
                store.setValue('stream', Readable.from(['data']), { contentType: 'text/plain' }),
            ).rejects.toThrow(/stream/);

            await withDirectStorageAccess(async () =>
                store.setValue('stream', Readable.from([Buffer.from('data')]), { contentType: 'text/plain' }),
            );
        });

        await expect(store.getValue('stream')).resolves.toBe('data');
    });

    test('a stream value is rejected before the auto-saved cache is touched', async () => {
        const store = await KeyValueStore.open();
        // Warm the shared cache first - the cache update only runs for a key it already holds.
        const state = await store.getAutoSavedValue<{ a: number }>('STREAM_STATE', { a: 1 });

        await withStorageTransaction(async () => {
            await expect(
                store.setValue('STREAM_STATE', Readable.from(['data']), { contentType: 'text/plain' }),
            ).rejects.toThrow(/stream/);
        });

        // A stream is `typeof 'object'`, so a cache update reached before the rejection would splice the
        // stream's internals into the live state object every handler shares.
        expect(state).toEqual({ a: 1 });
    });

    test('auto-saved values bypass the transaction', async () => {
        const store = await KeyValueStore.open();

        await withStorageTransaction(async (transaction) => {
            // A buffered write to the state key must not leak into the shared auto-saved cache.
            await store.setValue('STATE', { poisoned: true });
            const state = await store.getAutoSavedValue<{ poisoned?: boolean; counter?: number }>('STATE', {});
            expect(state.poisoned).toBeUndefined();

            state.counter = 1;
            transaction.rollback();
        });

        // Mutations of the auto-saved object are deliberately not rolled back.
        const state = await store.getAutoSavedValue<{ counter?: number }>('STATE', {});
        expect(state.counter).toBe(1);
    });

    test('a rolled-back setValue does not leak into a warm auto-saved state cache', async () => {
        const store = await KeyValueStore.open();

        // Seed the shared cache *first* - a buffered write only reaches it when it is already warm.
        const state = await store.getAutoSavedValue<{ a: number; injected?: boolean }>('WARM_STATE', { a: 1 });

        const transaction = createStorageTransaction();
        await transaction.run(async () => store.setValue('WARM_STATE', { a: 2, injected: true }));
        transaction.rollback();
        transaction.dispose();

        // The live object every handler shares must be untouched, or `persistState` would write it out.
        expect(state).toEqual({ a: 1 });
        await expect(store.getAutoSavedValue('WARM_STATE', {})).resolves.toEqual({ a: 1 });
        await expect(store.getValue('WARM_STATE')).resolves.toBeNull();
    });

    test('a committed setValue does reach the shared auto-saved state object', async () => {
        const store = await KeyValueStore.open();
        const state = await store.getAutoSavedValue<{ a: number }>('COMMITTED_STATE', { a: 1 });

        await withStorageTransaction(async () => store.setValue('COMMITTED_STATE', { a: 2 }));

        // Identity is preserved, so handlers holding the reference observe the committed value.
        expect(state).toEqual({ a: 2 });
        await expect(store.getValue('COMMITTED_STATE')).resolves.toEqual({ a: 2 });
    });

    test('drop, purge and clearCache are rejected inside a transaction', async () => {
        const store = await KeyValueStore.open();

        await withStorageTransaction(async () => {
            await expect(store.drop()).rejects.toThrow(/cannot be used inside a storage transaction/);
            await expect(store.purge()).rejects.toThrow(/cannot be used inside a storage transaction/);
            expect(() => store.clearCache()).toThrow(/cannot be used inside a storage transaction/);
        });
    });
});

describe('RequestQueue in a transaction', () => {
    test('write-through (default): adds are applied immediately, journaled, and never rolled back', async () => {
        const queue = await RequestQueue.open();

        await withStorageTransaction(async (transaction) => {
            await queue.addRequests([{ url: 'https://example.com/a' }, { url: 'https://example.com/b' }]);

            // Applied immediately - visible to the backend (and thus to concurrent handlers).
            await expect(queue.backend.getRequest('https://example.com/a')).resolves.toBeDefined();

            // ...but still journaled for introspection.
            expect(transaction.enqueuedUrls.map(({ url }) => url)).toEqual([
                'https://example.com/a',
                'https://example.com/b',
            ]);

            transaction.rollback();
        });

        await expect(queue.getTotalCount()).resolves.toBe(2);
    });

    test('deferred: adds are buffered, readable within the transaction, and applied at commit', async () => {
        const queue = await RequestQueue.open();
        const addBatchSpy = vitest.spyOn(queue.backend, 'addBatchOfRequests');

        await withStorageTransaction(
            async () => {
                const info = await queue.addRequest({ url: 'https://example.com/a' });

                expect(info.wasAlreadyPresent).toBe(false);
                // The requestId is the locally derived hash, documented provisional.
                expect(info.requestId).toBe(getRequestId('https://example.com/a'));

                // Read-your-own-writes within the transaction...
                await expect(queue.getRequest('https://example.com/a')).resolves.toMatchObject({
                    url: 'https://example.com/a',
                });
                await expect(queue.checkReadiness()).resolves.toEqual({ status: 'ready' });
                const queueInfo = await queue.getInfo();
                expect(queueInfo.pendingRequestCount).toBe(1);

                // ...but nothing has reached the backend yet.
                expect(addBatchSpy).not.toHaveBeenCalled();

                // Intra-transaction dedup consults the read index.
                const duplicate = await queue.addRequest({ url: 'https://example.com/a' });
                expect(duplicate.wasAlreadyPresent).toBe(true);
            },
            { policy: { requestQueue: 'deferred' } },
        );

        // The commit replay carries no request ids - the backend assigns them.
        expect(addBatchSpy).toHaveBeenCalledTimes(1);
        const [committedRequests] = addBatchSpy.mock.calls[0];
        expect(committedRequests).toHaveLength(1);
        expect(committedRequests[0].id).toBeUndefined();

        await expect(queue.getTotalCount()).resolves.toBe(1);
    });

    test('deferred: a re-enqueued Request instance does not leak its id or handledAt into the commit', async () => {
        const queue = await RequestQueue.open();
        const addBatchSpy = vitest.spyOn(queue.backend, 'addBatchOfRequests');

        // Looks like it came from a backend: foreign id, already handled.
        const reenqueued = new Request({
            url: 'https://example.com/old',
            id: 'foreign-backend-id',
            handledAt: new Date().toISOString(),
        });

        await withStorageTransaction(
            async () => {
                const info = await queue.addRequests([reenqueued]);
                expect(info.processedRequests[0].wasAlreadyPresent).toBe(false);
            },
            { policy: { requestQueue: 'deferred' } },
        );

        // The contract under test is what crosses the backend boundary at commit: the stale id must not
        // reach the storage backend (a validating backend would reject it, failing the whole commit),
        // nor the handled marker (the request would be buried as already-handled).
        expect(addBatchSpy).toHaveBeenCalledTimes(1);
        const [committedRequests] = addBatchSpy.mock.calls[0];
        expect(committedRequests).toHaveLength(1);
        expect(committedRequests[0].id).toBeUndefined();
        expect(committedRequests[0].handledAt).toBeUndefined();

        // Which id the request ends up with is deliberately *not* asserted - that is the backend's own
        // affair: it deduplicates on `uniqueKey` and assigns the id itself (for the bundled backends,
        // the same `getRequestId(uniqueKey)` hash the provisional id was derived from, so the stored
        // request lands with the very id the journal time promised). Either way, it lands pending and
        // fetchable.
        await expect(queue.getInfo()).resolves.toMatchObject({ totalRequestCount: 1, pendingRequestCount: 1 });
    });

    test('deferred: requests the backend rejects at commit are warned about and skipped', async () => {
        const queue = await RequestQueue.open();
        const warningSpy = vitest.spyOn((queue as any).log, 'warning');

        // The backend refuses the request outright. Transient failures are the backend's own job to
        // retry, so what it reports as unprocessed is a semantic rejection - the commit warns and
        // moves on instead of dropping the link silently (or failing the whole request over it).
        const addBatchSpy = vitest.spyOn(queue.backend, 'addBatchOfRequests').mockImplementation(async (batch) => ({
            processedRequests: [],
            unprocessedRequests: batch.map((r) => ({ uniqueKey: r.uniqueKey, url: r.url })),
        }));

        await withStorageTransaction(
            async () => {
                await queue.addRequests([{ url: 'https://example.com/rejected' }]);
            },
            { policy: { requestQueue: 'deferred' } },
        );

        expect(addBatchSpy).toHaveBeenCalledTimes(1);
        expect(warningSpy).toHaveBeenCalledTimes(1);
        expect(warningSpy.mock.calls[0][0]).toMatch(/rejected by the request queue while committing/);
        await expect(queue.getTotalCount()).resolves.toBe(0); // the rejected request never landed
    });

    test('deferred: a rolled-back transaction leaves the dedup caches untouched', async () => {
        const queue = await RequestQueue.open();

        const transaction = createStorageTransaction({ policy: { requestQueue: 'deferred' } });
        const request = { url: 'https://example.com/a' };

        await transaction.run(async () => queue.addRequest({ ...request }));
        transaction.rollback();
        transaction.dispose();

        await expect(queue.getTotalCount()).resolves.toBe(0);

        // A later, genuine add of the same uniqueKey must still reach the backend.
        const addBatchSpy = vitest.spyOn(queue.backend, 'addBatchOfRequests');
        const info = await queue.addRequest({ ...request });
        expect(info.wasAlreadyPresent).toBe(false);
        expect(addBatchSpy).toHaveBeenCalledTimes(1);
    });

    test('deferred: requests already known to the dedup caches are not probed against the backend', async () => {
        const queue = await RequestQueue.open();
        const known = { url: 'https://example.com/known' };

        // Populates `requestCache` / `requestSeenCache` with the real backend id.
        const { requestId } = await queue.addRequest({ ...known });

        const getRequestSpy = vitest.spyOn(queue.backend, 'getRequest');

        await withStorageTransaction(
            async () => {
                const info = await queue.addRequest({ ...known });
                expect(info.wasAlreadyPresent).toBe(true);
                // The cached id is the real one the backend assigned, not the provisional hash.
                expect(info.requestId).toBe(requestId);

                // A genuinely unknown request still falls through to the probe.
                await queue.addRequest({ url: 'https://example.com/unknown' });
            },
            { policy: { requestQueue: 'deferred' } },
        );

        expect(getRequestSpy.mock.calls.map(([uniqueKey]) => uniqueKey)).toEqual(['https://example.com/unknown']);
    });

    test('write-through: an add still in flight when the transaction closes does not throw', async () => {
        const queue = await RequestQueue.open();
        const transaction = createStorageTransaction();

        // Mimics a request handler timing out: `handleRequest` rolls the transaction back while the
        // handler's storage calls keep running, so the add resumes against a closed transaction.
        const addBatch = queue.backend.addBatchOfRequests.bind(queue.backend);
        vitest.spyOn(queue.backend, 'addBatchOfRequests').mockImplementation(async (requests, options) => {
            transaction.rollback();
            return addBatch(requests, options);
        });

        await transaction.run(async () => {
            await expect(queue.addRequest({ url: 'https://example.com/a' })).resolves.toMatchObject({
                wasAlreadyPresent: false,
            });
        });

        // The entry is introspection-only and the transaction is already decided, so it is simply skipped.
        expect(transaction.enqueuedUrls).toEqual([]);
        transaction.dispose();

        // Write-through additions were never going to be rolled back.
        await expect(queue.getTotalCount()).resolves.toBe(1);
    });

    test('deferred: an add still in flight when the transaction closes reaches the real queue', async () => {
        const queue = await RequestQueue.open();
        const transaction = createStorageTransaction({ policy: { requestQueue: 'deferred' } });

        const getRequest = queue.backend.getRequest.bind(queue.backend);
        vitest.spyOn(queue.backend, 'getRequest').mockImplementation(async (uniqueKey) => {
            transaction.rollback();
            return getRequest(uniqueKey);
        });

        await transaction.run(async () => {
            await expect(queue.addRequest({ url: 'https://example.com/a' })).resolves.toMatchObject({
                wasAlreadyPresent: false,
            });
        });
        transaction.dispose();

        // Here the journal entry *is* the write, so it passes through rather than being dropped -
        // an unwanted (but deduplicated) addition beats losing a request silently.
        await expect(queue.getTotalCount()).resolves.toBe(1);
    });

    test('deferred: a multi-chunk addRequestsBatched call is fully applied when commit resolves', async () => {
        const queue = await RequestQueue.open();
        const requests = Array.from({ length: 1500 }, (_, i) => ({ url: `https://example.com/${i}` }));

        await withStorageTransaction(
            async () => {
                await queue.addRequestsBatched(requests);
                const { pendingRequestCount } = await queue.getInfo();
                expect(pendingRequestCount).toBe(1500);
            },
            { policy: { requestQueue: 'deferred' } },
        );

        // Replaying through the batched frontend wrapper instead of the backend call would resolve
        // with chunks still in flight and drop the tail.
        await expect(queue.getTotalCount()).resolves.toBe(1500);
    });

    test('requestsFromUrl sources are observed through their expanded URLs in `enqueuedUrls`', async () => {
        // Mocked at the HTTP client level: the list download goes through the queue's configured client.
        const lists: Record<string, string[]> = {
            'http://example.com/list-1': ['https://example.com/a', 'https://example.com/b'],
            'http://example.com/list-2': ['https://example.com/c'],
        };
        // Carries the BaseHttpClient prototype so the queue's `z.instanceof` validation accepts it.
        const sendRequest = vitest.fn(async (request: { url: string }) => {
            return new Response(lists[request.url]?.join('\n') ?? '');
        });
        const httpClient = Object.assign(Object.create(BaseHttpClient.prototype) as BaseHttpClient, {
            sendRequest,
            stream: vitest.fn(async () => new Response()),
        });

        // There is no `enqueuedUrlLists` on the view - the list is downloaded at call time and the
        // *fetched* URLs are journaled, under either policy.
        const queue = await RequestQueue.open(null, { httpClient });

        await withStorageTransaction(async (transaction) => {
            await queue.addRequests([{ requestsFromUrl: 'http://example.com/list-1', label: 'from-list' }]);

            // writeThrough (default): applied immediately, and journaled for introspection.
            expect(transaction.enqueuedUrls).toEqual([
                { url: 'https://example.com/a', label: 'from-list' },
                { url: 'https://example.com/b', label: 'from-list' },
            ]);
        });

        await expect(queue.getTotalCount()).resolves.toBe(2);

        await withStorageTransaction(
            async (transaction) => {
                await queue.addRequests([{ requestsFromUrl: 'http://example.com/list-2' }]);

                // deferred: journaled the same way, applied only at commit.
                expect(transaction.enqueuedUrls).toEqual([{ url: 'https://example.com/c' }]);
            },
            { policy: { requestQueue: 'deferred' } },
        );

        expect(httpClient.sendRequest).toHaveBeenCalledTimes(2);
        await expect(queue.getTotalCount()).resolves.toBe(3);
    });

    test('crawler bookkeeping operations are rejected inside a transaction', async () => {
        const queue = await RequestQueue.open();
        await queue.addRequest({ url: 'https://example.com' });
        const fetched = await withDirectStorageAccess(async () => queue.fetchNextRequest());

        await withStorageTransaction(async () => {
            await expect(queue.fetchNextRequest()).rejects.toThrow(/cannot be used inside a storage transaction/);
            await expect(queue.markRequestAsHandled(fetched!)).rejects.toThrow(
                /cannot be used inside a storage transaction/,
            );
            await expect(queue.reclaimRequest(fetched!)).rejects.toThrow(/cannot be used inside a storage transaction/);
            await expect(queue.drop()).rejects.toThrow(/cannot be used inside a storage transaction/);
            await expect(queue.purge()).rejects.toThrow(/cannot be used inside a storage transaction/);

            // The escape hatch still works for callers who genuinely mean it.
            await withDirectStorageAccess(async () => queue.reclaimRequest(fetched!));
        });
    });
});
