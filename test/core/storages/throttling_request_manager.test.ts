import type { AddRequestsBatchedResult, StorageIdentifier, ThrottlingRequestManagerOptions } from '@crawlee/core';
import {
    KeyValueStore,
    MemoryStorageBackend,
    RequestQueue,
    serviceLocator,
    ThrottlingRequestManager,
    withStorageTransaction,
} from '@crawlee/core';
import { sleep } from '@crawlee/utils';

describe('ThrottlingRequestManager', () => {
    beforeEach(() => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    async function createQueue(name = 'inner-queue') {
        return RequestQueue.open({ name });
    }

    function domainState(manager: ThrottlingRequestManager, domain: string) {
        return (manager as any).domainStates.get(domain);
    }

    /** Models the crawler's task loop: poll, and idle while the manager reports itself empty. */
    async function pollForNextRequest(manager: ThrottlingRequestManager, timeoutMs = 5000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const request = await manager.fetchNextRequest();
            if (request) {
                return request;
            }
            await sleep(20);
        }
        throw new Error('Timed out waiting for a request to become available');
    }

    test('Routing: requests to configured domains route to sub-managers, others to inner queue', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({
            inner,
            domains: ['example.com'],
        });

        // Add request to inner domain
        await manager.addRequest({ url: 'https://other.com/a' });
        // Add request to throttled domain
        await manager.addRequest({ url: 'https://example.com/a' });

        expect(await inner.getTotalCount()).toBe(1);
        expect(await manager.getTotalCount()).toBe(2);

        // Fetching next request should yield them
        const req1 = await manager.fetchNextRequest();
        expect(req1!.url).toBe('https://example.com/a'); // Throttled domains checked first

        const req2 = await manager.fetchNextRequest();
        expect(req2!.url).toBe('https://other.com/a');

        expect(await manager.fetchNextRequest()).toBeNull();
    });

    test('Routing: a configured domain matches however its hostname is spelled', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({
            inner,
            // A unicode, a punycode and a root-dotted spelling.
            domains: ['HÁČKY.cz', 'xn--bcher-kva.example', 'example.com.', '[::1]'],
        });

        await manager.addRequest({ url: 'https://xn--hky-ela4t.cz/punycode' });
        await manager.addRequest({ url: 'https://háčky.cz./unicode-with-root-dot' });
        await manager.addRequest({ url: 'https://bücher.example/unicode' });
        await manager.addRequest({ url: 'https://example.com/no-root-dot' });
        await manager.addRequest({ url: 'http://[::1]:8080/bracketed' });

        // Every one of them belongs to a configured domain, so none of them fell through to the inner queue.
        expect(await inner.getTotalCount()).toBe(0);
        expect(await manager.getTotalCount()).toBe(5);
    });

    test('rejects a domain that is not a hostname', async () => {
        const inner = await createQueue();

        // Unbracketed IPv6 - previously accepted, then silently matched nothing.
        expect(() => new ThrottlingRequestManager({ inner, domains: ['::1'] })).toThrow(/not a valid hostname/);
    });

    test('addRequestsBatched routing', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({
            inner,
            domains: ['example.com', 'foo.com'],
        });

        await manager.addRequestsBatched([
            { url: 'https://example.com/1' },
            { url: 'https://other.com/1' },
            { url: 'https://foo.com/1' },
        ]);

        expect(await inner.getTotalCount()).toBe(1);
        expect(await manager.getTotalCount()).toBe(3);
    });

    test('addRequestsBatched consumes the input lazily and honours maxNewRequests', async () => {
        const manager = new ThrottlingRequestManager({
            inner: await createQueue(),
            domains: ['example.com'],
        });

        let produced = 0;
        async function* urls() {
            for (let i = 0; i < 10; i++) {
                produced++;
                yield { url: `https://example.com/${i}` };
            }
        }

        const result = await manager.addRequestsBatched(urls(), { batchSize: 2, maxNewRequests: 4 });

        expect(await manager.getTotalCount()).toBe(4);
        expect(result.requestsOverLimit).toHaveLength(6);
        // Everything was pulled to report the leftovers, but only via the budget-capped chunks.
        expect(produced).toBe(10);
    });

    test('addRequestsBatched keeps checkReadiness() from reporting finished while background batches are landing', async () => {
        const inner = await createQueue();
        // Reports itself done the moment each batch lands, so only our own batch bookkeeping can hold the crawl open.
        const eagerlyFinished = {
            ...inner,
            addRequestsBatched: inner.addRequestsBatched.bind(inner),
            getTotalCount: inner.getTotalCount.bind(inner),
            checkReadiness: async () => ({ status: 'finished' }) as const,
        } as unknown as RequestQueue;

        const manager = new ThrottlingRequestManager({ inner: eagerlyFinished, domains: [] });

        const result = await manager.addRequestsBatched(
            [{ url: 'https://other.com/1' }, { url: 'https://other.com/2' }],
            { batchSize: 1, waitBetweenBatchesMillis: 0 },
        );

        // The inner manager reports itself finished as soon as its own batch lands, but ours must not -
        // there is still a batch in flight behind it.
        expect((await manager.checkReadiness()).status).toBe('waiting');

        await result.waitForAllRequestsToBeAdded;
        expect(await manager.getTotalCount()).toBe(2);
    });

    test('addRequestsBatched surfaces a background failure without an unhandled rejection', async () => {
        const inner = await createQueue();
        let batches = 0;
        const flaky = {
            ...inner,
            addRequestsBatched: async (...args: Parameters<RequestQueue['addRequestsBatched']>) => {
                if (++batches > 1) {
                    throw new Error('backend exploded');
                }
                return inner.addRequestsBatched(...args);
            },
        } as unknown as RequestQueue;

        const manager = new ThrottlingRequestManager({ inner: flaky, domains: [] });

        const result = await manager.addRequestsBatched(
            [{ url: 'https://other.com/1' }, { url: 'https://other.com/2' }],
            { batchSize: 1, waitBetweenBatchesMillis: 0 },
        );

        // Nobody is obliged to await this - but if it rejects unhandled, Node kills the process.
        await expect(result.waitForAllRequestsToBeAdded).rejects.toThrow('backend exploded');
    });

    describe('addRequestsBatched in a transaction', () => {
        const sixRequests = Array.from({ length: 6 }, (_, i) => ({ url: `https://example.com/${i}` }));

        test('deferred: every batch is rolled back, not just the first', async () => {
            const manager = new ThrottlingRequestManager({ inner: await createQueue(), domains: ['example.com'] });

            let result!: AddRequestsBatchedResult;
            await withStorageTransaction(
                async (transaction) => {
                    result = await manager.addRequestsBatched(sixRequests, {
                        batchSize: 2,
                        waitBetweenBatchesMillis: 0,
                    });
                    transaction.rollback();
                },
                { policy: { requestQueue: 'deferred' } },
            );
            await result.waitForAllRequestsToBeAdded;

            expect(await manager.getTotalCount()).toBe(0);
        });

        test('write-through: batches that outlive the transaction stay out of its journal', async () => {
            const manager = new ThrottlingRequestManager({ inner: await createQueue(), domains: ['example.com'] });

            await withStorageTransaction(async (transaction) => {
                const result = await manager.addRequestsBatched(sixRequests, {
                    batchSize: 2,
                    waitBetweenBatchesMillis: 0,
                });
                await result.waitForAllRequestsToBeAdded;

                // Only the initial batch was added within the transaction's scope; the rest writes directly,
                // exactly as a bare `RequestQueue` does.
                expect(transaction.enqueuedUrls).toHaveLength(2);
            });
        });
    });

    test('warns that requestsFromUrl sources cannot be domain-routed', async () => {
        const manager = new ThrottlingRequestManager({
            inner: await createQueue(),
            domains: ['example.com'],
        });
        const warning = vitest.spyOn((manager as any).log, 'warning').mockImplementation(() => {});

        await manager.addRequestsBatched([
            { requestsFromUrl: 'https://example.com/urls.txt' },
            { requestsFromUrl: 'https://example.com/more.txt' },
        ]);

        expect(warning).toHaveBeenCalledTimes(1);
        expect(warning.mock.calls[0][0]).toMatch(/requestsFromUrl/);
    });

    test('a request fetched from the inner manager is handed back to it', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({ inner, domains: ['example.com'] });

        // Bypasses routing, exactly as a `RequestList` transfer or a `requestsFromUrl` expansion does - so the
        // request sits in the inner manager despite belonging to a throttled domain.
        await inner.addRequest({ url: 'https://example.com/1' });

        const request = (await manager.fetchNextRequest())!;
        await manager.markRequestAsHandled(request);

        // Marking it handled in its domain's sub-queue instead would leave the inner manager serving it forever.
        expect((await manager.checkReadiness()).status).toBe('finished');
        expect(await inner.getPendingCount()).toBe(0);
    });

    test('a request the inner manager holds is paced by its domain like any other', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({ inner, domains: ['example.com'], baseDelaySecs: 0.5 });

        // The same bypass as above, so the request belongs to a throttled domain without being stored per domain.
        await inner.addRequest({ url: 'https://example.com/1' });

        const request = (await manager.fetchNextRequest())!;
        expect(manager.recordPacingSignal({ url: request.url, reason: 'rateLimited' })).toBe(true);
        // What the crawler does with the `RequestThrottledError` a 429 raises: reclaim, no retry spent.
        await manager.reclaimRequest(request);

        // Handing it straight back would have the crawler hammer the domain that just turned it away, and
        // nothing else would slow it down - a deferred request costs neither a retry nor session reputation.
        expect(await manager.fetchNextRequest()).toBeNull();
        // Nothing to dispatch until the backoff runs out, while the request is still outstanding work rather
        // than lost - a manager reporting `ready` here would have the crawler spin, `finished` drop it.
        expect((await manager.checkReadiness()).status).toBe('waiting');

        const start = Date.now();
        const again = await pollForNextRequest(manager);

        expect(Date.now() - start).toBeGreaterThanOrEqual(400);
        expect(again.url).toBe('https://example.com/1');
    });

    test('a domain being held back does not stop the inner manager serving the others', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({ inner, domains: ['example.com'], baseDelaySecs: 60 });

        await inner.addRequest({ url: 'https://example.com/held-back' });
        await inner.addRequest({ url: 'https://other.com/free' });

        const held = (await manager.fetchNextRequest())!;
        expect(held.url).toBe('https://example.com/held-back');
        manager.recordPacingSignal({ url: held.url, reason: 'rateLimited' });
        await manager.reclaimRequest(held);

        // The reclaimed request is still ahead of the other one, and skipping it must not mean skipping the queue.
        const request = await manager.fetchNextRequest();
        expect(request!.url).toBe('https://other.com/free');
    });

    test('the backlog a throttled domain has in the inner manager is moved out of it, not walked again', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({ inner, domains: ['example.com'], baseDelaySecs: 60 });

        // The same bypass as above, at the size that makes the cost visible.
        for (let i = 0; i < 20; i++) {
            await inner.addRequest({ url: `https://example.com/${i}` });
        }
        await inner.addRequest({ url: 'https://other.com/free' });

        manager.recordPacingSignal({ url: 'https://example.com/0', reason: 'rateLimited' });

        const fetchedFromInner = vitest.spyOn(inner, 'fetchNextRequest');
        const reclaimedToInner = vitest.spyOn(inner, 'reclaimRequest');

        expect((await manager.fetchNextRequest())!.url).toBe('https://other.com/free');

        expect(fetchedFromInner).toHaveBeenCalledTimes(21);
        expect(reclaimedToInner).not.toHaveBeenCalled();
        // Nothing lost on the way, and nothing counted twice: moving a request marks it handled where it came
        // from, so both managers hold a record of it.
        expect(await manager.getPendingCount()).toBe(21);
        expect(await manager.getTotalCount()).toBe(21);
        expect(await manager.getHandledCount()).toBe(0);

        fetchedFromInner.mockClear();
        await manager.addRequest({ url: 'https://other.com/behind-it' });

        // The point of moving it: enqueuing no longer re-arms a walk over the backlog, which on a queue whose
        // every read is a round trip is the whole cost.
        expect((await manager.fetchNextRequest())!.url).toBe('https://other.com/behind-it');
        expect(fetchedFromInner).toHaveBeenCalledTimes(1);
    });

    test('a request whose migration fails goes back to the inner manager instead of being stranded', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({
            inner,
            domains: ['example.com'],
            baseDelaySecs: 60,
            requestManagerOpener: async (identifier, options) => {
                const queue = await RequestQueue.open(identifier, options);
                queue.addRequest = async () => {
                    throw new Error('sub-queue unavailable');
                };
                return queue;
            },
        });

        await inner.addRequest({ url: 'https://example.com/held-back' });
        manager.recordPacingSignal({ url: 'https://example.com/held-back', reason: 'rateLimited' });

        await expect(manager.fetchNextRequest()).rejects.toThrow('sub-queue unavailable');

        // Left in progress in a manager nobody will hand it back to, it would be lost for the rest of the run.
        expect((await inner.fetchNextRequest())!.url).toBe('https://example.com/held-back');
    });

    describe('a lazily-opened inner manager', () => {
        const throttling = { domains: ['example.com'] } satisfies Omit<
            ThrottlingRequestManagerOptions<RequestQueue>,
            'inner'
        >;

        test('is resolved once, so a whole batch lands in - and is handed back to - one instance', async () => {
            const factory = vitest.fn(async () => createQueue());
            const manager = new ThrottlingRequestManager({ ...throttling, inner: factory });

            await manager.addRequestsBatched([
                { url: 'https://example.com/1' },
                { url: 'https://other.com/1' },
                { url: 'https://example.com/2' },
            ]);

            const inner = manager.innerManager!;
            expect(await inner.getTotalCount()).toBe(1);
            expect(await manager.getTotalCount()).toBe(3);

            // The inner-routed request is the one that matters: handed back to a second instance, it would leave
            // this one serving it forever.
            for (let i = 0; i < 3; i++) {
                await manager.markRequestAsHandled(await pollForNextRequest(manager));
            }

            expect((await manager.checkReadiness()).status).toBe('finished');
            expect(await inner.getPendingCount()).toBe(0);
            expect(factory).toHaveBeenCalledTimes(1);
        });

        test('is not forced by bookkeeping', async () => {
            const factory = vitest.fn(async () => createQueue());
            const manager = new ThrottlingRequestManager({ ...throttling, inner: factory });

            await manager.purge();
            await manager.persistState();
            await manager.setExpectedRequestProcessingTimeSecs(600);
            await manager.drop();

            expect(factory).not.toHaveBeenCalled();
            expect(manager.innerManager).toBeUndefined();
        });

        test('receives an expected-processing-time hint given before it was resolved', async () => {
            const inner = await createQueue();
            const setHint = vitest.spyOn(inner, 'setExpectedRequestProcessingTimeSecs');
            const manager = new ThrottlingRequestManager({ ...throttling, inner: () => inner });

            await manager.setExpectedRequestProcessingTimeSecs(600);
            expect(setHint).not.toHaveBeenCalled();

            await manager.fetchNextRequest();

            expect(setHint).toHaveBeenCalledWith(600);
        });

        test('is opened by checkReadiness(), so requests left in it by a previous run are not missed', async () => {
            // Without purgeOnStart, an unopened queue may still hold work nobody would ever look at.
            await (await createQueue('leftover-inner')).addRequest({ url: 'https://other.com/left-behind' });

            const manager = new ThrottlingRequestManager({
                ...throttling,
                inner: () => createQueue('leftover-inner'),
            });

            expect((await manager.checkReadiness()).status).toBe('ready');
            expect(manager.innerManager).toBeDefined();
        });

        test('is exposed by innerManager only once resolved, which reading it never triggers', async () => {
            const inner = await createQueue();
            const factory = vitest.fn(() => inner);
            const manager = new ThrottlingRequestManager({ ...throttling, inner: factory });

            expect(manager.innerManager).toBeUndefined();
            expect(factory).not.toHaveBeenCalled();

            await manager.addRequest({ url: 'https://other.com/1' });

            expect(manager.innerManager).toBe(inner);
            expect(factory).toHaveBeenCalledTimes(1);
        });

        describe('omitted entirely', () => {
            test('opens the default queue on first use, and not before', async () => {
                const manager = new ThrottlingRequestManager({ domains: ['example.com'] });

                expect(manager.innerManager).toBeUndefined();

                await manager.addRequest({ url: 'https://other.com/1' });

                expect(manager.innerManager).toBeInstanceOf(RequestQueue);
                expect((await manager.fetchNextRequest())!.url).toBe('https://other.com/1');
            });

            test('routes throttled domains by domain as usual', async () => {
                const manager = new ThrottlingRequestManager({
                    domains: 'all',
                    throttleBy: 'registrableDomain',
                    minCrawlDelaySecs: 60,
                });

                await manager.addRequest({ url: 'https://example.com/1' });
                await manager.addRequest({ url: 'https://example.com/2' });

                expect((await manager.fetchNextRequest())!.url).toBe('https://example.com/1');
                // Paced, so nothing of the second request until the delay runs out - and the default queue,
                // opened for the requests nobody routed, is empty rather than serving it.
                expect(await manager.fetchNextRequest()).toBeNull();
                expect(await manager.innerManager!.getTotalCount()).toBe(0);
            });

            test('is honoured by `requestManagerOpener`, so the default is not hardcoded', async () => {
                const opener = vitest.fn(async (identifier?: string | StorageIdentifier | null) =>
                    RequestQueue.open(identifier ?? 'substituted-default'),
                );
                const manager = new ThrottlingRequestManager({
                    domains: ['example.com'],
                    requestManagerOpener: opener,
                });

                await manager.addRequest({ url: 'https://other.com/1' });

                // Called with no identifier for the wrapped manager, and with an alias per throttled domain.
                expect(opener).toHaveBeenCalledWith(null, expect.anything());
                expect(manager.innerManager!.name).toBe('substituted-default');
            });
        });
    });

    test('recordPacingSignal enforces throttling and fair scheduling', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({
            inner,
            domains: ['example.com', 'foo.com'],
            baseDelaySecs: 0.1,
        });

        await manager.addRequest({ url: 'https://example.com/1' });
        await manager.addRequest({ url: 'https://foo.com/1' });

        // Long enough that a loaded box cannot race the assertions below - the backoff is zeroed, never waited out.
        expect(
            manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited', waitMs: 10_000 }),
        ).toBe(true);

        // The throttled domain is skipped rather than holding the crawl up.
        expect((await manager.fetchNextRequest())!.url).toBe('https://foo.com/1');

        // Nothing left to hand over - and the manager says so rather than blocking the caller...
        expect(await manager.fetchNextRequest()).toBeNull();
        const waiting = await manager.checkReadiness();
        // ...while still reporting the throttled request as outstanding work, due once its backoff runs out.
        expect(waiting).toMatchObject({ status: 'waiting' });
        expect(waiting.status === 'waiting' && waiting.readyAt).toBeGreaterThan(Date.now());

        domainState(manager, 'example.com').backoffUntil = 0;
        expect((await manager.fetchNextRequest())!.url).toBe('https://example.com/1');
    });

    test('a burst of concurrent 429s advances the backoff only once', async () => {
        const manager = new ThrottlingRequestManager({
            inner: await createQueue(),
            domains: ['example.com'],
            baseDelaySecs: 0.05,
            maxDelaySecs: 60,
        });

        // Eight requests were already in flight when the limit was hit; they all come back 429.
        for (let i = 0; i < 8; i++) {
            expect(manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited' })).toBe(true);
        }

        expect(domainState(manager, 'example.com').consecutive429Count).toBe(1);
    });

    test('the backoff decays once the domain has stopped rate-limiting', async () => {
        const manager = new ThrottlingRequestManager({
            inner: await createQueue(),
            domains: ['example.com'],
            baseDelaySecs: 10,
            maxDelaySecs: 60,
        });
        const state = domainState(manager, 'example.com');

        manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited' });

        // Rewinding both clocks beats sleeping out real delays - a loaded CI box cannot race it.
        const rewind = (ms: number) => {
            state.backoffUntil -= ms;
            state.backoffDecaysAt -= ms;
        };

        // Past the backoff but still inside the decay window: the next 429 continues the same burst.
        rewind(11_000);
        manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited' });
        expect(state.consecutive429Count).toBe(2);

        // Past the decay window as well: the domain is treated as recovered and the exponent restarts.
        rewind(41_000);
        manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited' });
        expect(state.consecutive429Count).toBe(1);
    });

    test('caps the delay at maxDelaySecs', async () => {
        const manager = new ThrottlingRequestManager({
            inner: await createQueue(),
            domains: ['example.com'],
            maxDelaySecs: 1,
        });

        manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited', waitMs: 3_600_000 });

        expect(domainState(manager, 'example.com').backoffUntil).toBeLessThanOrEqual(Date.now() + 1000);
    });

    test('fetchNextRequest does not block while a domain is throttled', async () => {
        const manager = new ThrottlingRequestManager({
            inner: await createQueue(),
            domains: ['example.com'],
            maxDelaySecs: 60,
        });

        await manager.addRequest({ url: 'https://example.com/1' });
        manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited', waitMs: 60_000 });

        const start = Date.now();
        expect(await manager.fetchNextRequest()).toBeNull();

        expect(Date.now() - start).toBeLessThan(1000);
    });

    test('picks up requests left in per-domain sub-queues by a previous run (if purgeOnStart is not enabled)', async () => {
        const domains = ['example.com'];

        const firstRun = new ThrottlingRequestManager({ inner: await createQueue(), domains });
        await firstRun.addRequest({ url: 'https://example.com/left-behind' });
        expect(await firstRun.getPendingCount()).toBe(1);

        // A restart builds a brand new manager over the same storage backend.
        const secondRun = new ThrottlingRequestManager({ inner: await createQueue(), domains });

        expect((await secondRun.checkReadiness()).status).toBe('ready');
        expect(await secondRun.getPendingCount()).toBe(1);
        expect((await secondRun.fetchNextRequest())!.url).toBe('https://example.com/left-behind');
    });

    test('purge empties per-domain sub-queues it has not touched yet', async () => {
        const domains = ['example.com'];

        const firstRun = new ThrottlingRequestManager({ inner: await createQueue(), domains });
        await firstRun.addRequest({ url: 'https://example.com/stale' });

        const subQueue = await RequestQueue.open({ alias: 'throttled-example.com' });
        expect(await subQueue.getPendingCount()).toBe(1);

        const secondRun = new ThrottlingRequestManager({ inner: await createQueue(), domains });
        await secondRun.purge();

        expect(await subQueue.getPendingCount()).toBe(0);
    });

    test('purges its own queues even when the wrapped manager refuses', async () => {
        // A backend that cannot empty a queue in place refuses outright rather than quietly doing nothing.
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({ inner, domains: ['example.com'] });
        await manager.addRequest({ url: 'https://example.com/stale' });

        const subQueue = await RequestQueue.open({ alias: 'throttled-example.com' });
        expect(await subQueue.getPendingCount()).toBe(1);

        vitest.spyOn(inner, 'purge').mockRejectedValue(new Error('cannot empty a request queue in place'));

        await expect(manager.purge()).rejects.toThrow('cannot empty a request queue in place');
        expect(await subQueue.getPendingCount()).toBe(0);
    });

    describe('stall detection', () => {
        const stallingManager = async () =>
            new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: ['example.com'],
                baseDelaySecs: 0.01,
                maxDomainStallSecs: 30,
            });

        /**
         * Ages the domain's ongoing run of 429s past the stall threshold. Backdating beats sleeping - a loaded
         * CI box cannot race it.
         */
        const stallFor = (manager: ThrottlingRequestManager, domain: string) => {
            domainState(manager, domain).rateLimitedSince -= 60_000;
        };

        test('gives up on a domain that never lets a request through', async () => {
            const manager = await stallingManager();
            await manager.addRequest({ url: 'https://example.com/1' });
            manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited' });

            expect((await manager.checkReadiness()).status).not.toBe('stalled');

            stallFor(manager, 'example.com');
            expect(await manager.checkReadiness()).toMatchObject({
                status: 'stalled',
                reason: expect.stringContaining('example.com'),
            });
        });

        test('a lapsed backoff does not let a stalling domain pass for progress', async () => {
            // A stonewalling domain is dispatchable between one 429 and the next, so whether a probe lands in
            // that window is a race. It must not decide whether the crawl gives up.
            const manager = await stallingManager();
            await manager.addRequest({ url: 'https://example.com/1' });
            manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited' });
            stallFor(manager, 'example.com');

            // Its backoff has run out, so its own queue would happily hand the request over.
            domainState(manager, 'example.com').backoffUntil = 0;
            const subQueue = await RequestQueue.open({ alias: 'throttled-example.com' });
            await expect(subQueue.checkReadiness()).resolves.toEqual({ status: 'ready' });

            expect((await manager.checkReadiness()).status).toBe('stalled');
        });

        test('work elsewhere outranks a stalling domain', async () => {
            const manager = await stallingManager();
            await manager.addRequest({ url: 'https://example.com/1' });
            manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited' });
            stallFor(manager, 'example.com');

            await manager.addRequest({ url: 'https://other.com/1' });

            expect((await manager.checkReadiness()).status).toBe('ready');
        });

        test('a handled request resets the clock', async () => {
            const manager = await stallingManager();
            await manager.addRequest({ url: 'https://example.com/1' });
            await manager.addRequest({ url: 'https://example.com/2' });
            manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited' });
            stallFor(manager, 'example.com');

            await manager.markRequestAsHandled((await pollForNextRequest(manager))!);

            expect((await manager.checkReadiness()).status).not.toBe('stalled');
        });

        test('work the inner manager holds keeps a stalling domain in view', async () => {
            // Its own backoff, long enough that the sweep below leaves the wrapped manager blocked - otherwise
            // the request it holds reads as work anyone can dispatch, which outranks the stall.
            const manager = new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: ['example.com'],
                baseDelaySecs: 30,
                maxDomainStallSecs: 30,
            });
            const inner = manager.innerManager!;

            // Its sub-queue stays empty, so this request is the only sign the domain still has work left.
            await inner.addRequest({ url: 'https://example.com/1' });

            const request = (await manager.fetchNextRequest())!;
            manager.recordPacingSignal({ url: request.url, reason: 'rateLimited' });
            await manager.reclaimRequest(request);
            stallFor(manager, 'example.com');

            // Sweeping it is what finds the request; without it the crawl would wait on the domain forever.
            await manager.fetchNextRequest();

            expect((await manager.checkReadiness()).status).toBe('stalled');
        });

        test('a domain that has run out of work is finished, not stalled', async () => {
            const manager = await stallingManager();
            manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited' });
            stallFor(manager, 'example.com');

            expect((await manager.checkReadiness()).status).not.toBe('stalled');
        });

        test('a domain that has been idle for longer than the window is not stalled by its first 429', async () => {
            const manager = new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: ['example.com'],
                baseDelaySecs: 0.01,
                maxDomainStallSecs: 0.05,
            });
            await manager.addRequest({ url: 'https://example.com/1' });

            // The crawl spent longer than the whole stall window elsewhere before this domain was touched.
            await sleep(100);

            // The first 429 starts the clock - it does not arrive with the idle time already on it.
            manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited' });

            expect((await manager.checkReadiness()).status).not.toBe('stalled');
        });

        test('a domain that was never rate-limited is never stalled', async () => {
            const manager = await stallingManager();
            await manager.addRequest({ url: 'https://example.com/1' });

            expect((await manager.checkReadiness()).status).not.toBe('stalled');
        });

        test('a domain that stopped rate-limiting a while ago is being waited out, not stalled', async () => {
            const manager = await stallingManager();
            await manager.addRequest({ url: 'https://example.com/1' });

            // A single old 429, and nothing since - which is what a `Crawl-delay` longer than the stall window
            // looks like. The domain is not turning us away, we are keeping our distance from it.
            manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited' });
            stallFor(manager, 'example.com');
            domainState(manager, 'example.com').lastRateLimitedAt -= 60_000;

            expect((await manager.checkReadiness()).status).not.toBe('stalled');
        });
    });

    test('a crawl-delay does not swallow the 429 backoff', async () => {
        const manager = new ThrottlingRequestManager({
            inner: await createQueue(),
            domains: ['example.com'],
        });

        manager.recordPacingSignal({
            url: 'https://example.com/1',
            reason: 'minInterval',
            intervalMs: 5_000,
            scope: 'hostname',
        });
        await manager.addRequest({ url: 'https://example.com/1' });
        await manager.addRequest({ url: 'https://example.com/2' });

        // Dispatching arms the crawl-delay, which used to read as an already-active backoff.
        await manager.fetchNextRequest();
        expect(
            manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited', waitMs: 30_000 }),
        ).toBe(true);

        const state = domainState(manager, 'example.com');
        expect(state.consecutive429Count).toBe(1);
        expect(state.backoffUntil).toBeGreaterThan(Date.now() + 25_000);

        // The longer of the two clocks wins, so the domain stays parked.
        expect(await manager.fetchNextRequest()).toBeNull();
    });

    test('concurrent fetches cannot dispatch past the crawl-delay', async () => {
        const manager = new ThrottlingRequestManager({
            inner: await createQueue(),
            // Holds every dispatch open long enough that the other callers demonstrably run while one is in
            // flight, rather than leaving the overlap to microtask ordering.
            requestManagerOpener: async (identifier, options) => {
                const queue = await RequestQueue.open(identifier, options);
                const fetch = queue.fetchNextRequest.bind(queue);
                queue.fetchNextRequest = async (...args) => {
                    await sleep(50);
                    return fetch(...args);
                };
                return queue;
            },
            domains: ['example.com'],
        });

        manager.recordPacingSignal({
            url: 'https://example.com/1',
            reason: 'minInterval',
            intervalMs: 60_000,
            scope: 'hostname',
        });
        for (let i = 0; i < 5; i++) {
            await manager.addRequest({ url: `https://example.com/${i}` });
        }

        // The task loop runs several tasks at once, each pulling its own request.
        const fetched = await Promise.all(Array.from({ length: 5 }, async () => manager.fetchNextRequest()));

        expect(fetched.filter(Boolean)).toHaveLength(1);
    });

    test('a domain that hands over nothing does not spend its crawl-delay slot', async () => {
        const manager = new ThrottlingRequestManager({
            inner: await createQueue(),
            domains: ['example.com'],
        });

        manager.recordPacingSignal({
            url: 'https://example.com/1',
            reason: 'minInterval',
            intervalMs: 60_000,
            scope: 'hostname',
        });

        // Nothing queued yet, so there is no dispatch for the delay to pace.
        expect(await manager.fetchNextRequest()).toBeNull();

        await manager.addRequest({ url: 'https://example.com/1' });
        expect((await manager.fetchNextRequest())!.url).toBe('https://example.com/1');
    });

    describe("domains: 'all'", () => {
        test('gives every domain a queue of its own, the first time it is seen', async () => {
            const inner = await createQueue();
            const manager = new ThrottlingRequestManager({ inner, domains: 'all' });

            await manager.addRequest({ url: 'https://example.com/1' });
            await manager.addRequestsBatched([{ url: 'https://other.com/1' }]);

            // Nothing was left unrouted, and no domain had to be named up front for that.
            expect(await inner.getTotalCount()).toBe(0);
            expect(await manager.getTotalCount()).toBe(2);
        });

        test('backs off a domain nobody listed', async () => {
            // No delay configured at all: the point is that an unlisted domain still gets a clock, which is
            // what makes its 429s actionable.
            const manager = new ThrottlingRequestManager({ inner: await createQueue(), domains: 'all' });

            await manager.addRequest({ url: 'https://example.com/1' });

            expect(
                manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited', waitMs: 60_000 }),
            ).toBe(true);
            expect(await manager.fetchNextRequest()).toBeNull();
        });

        test('paces one domain without holding back the others', async () => {
            const manager = new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: 'all',
                minCrawlDelaySecs: 0.5,
            });

            await manager.addRequest({ url: 'https://example.com/1' });
            await manager.addRequest({ url: 'https://example.com/2' });
            await manager.addRequest({ url: 'https://other.com/1' });

            expect((await manager.fetchNextRequest())!.url).toBe('https://example.com/1');
            // example.com is spending its delay, so the unrelated domain goes first...
            expect((await manager.fetchNextRequest())!.url).toBe('https://other.com/1');
            // ...and until the delay is up there is nothing else to hand out.
            expect(await manager.fetchNextRequest()).toBeNull();

            const start = Date.now();
            const next = await pollForNextRequest(manager);

            expect(Date.now() - start).toBeGreaterThanOrEqual(250);
            expect(next.url).toBe('https://example.com/2');
        });

        test('a longer robots.txt crawl-delay wins over the floor', async () => {
            const manager = new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: 'all',
                minCrawlDelaySecs: 0.01,
            });

            // Robots.txt is read before the domain's first request is enqueued, so the delay lands on a domain
            // the manager has never seen.
            expect(
                manager.recordPacingSignal({
                    url: 'https://example.com/robots.txt',
                    reason: 'minInterval',
                    intervalMs: 60_000,
                    scope: 'hostname',
                }),
            ).toBe(true);

            await manager.addRequest({ url: 'https://example.com/1' });
            await manager.addRequest({ url: 'https://example.com/2' });

            expect((await manager.fetchNextRequest())!.url).toBe('https://example.com/1');
            await sleep(50);
            expect(await manager.fetchNextRequest()).toBeNull();
        });

        test('throttleBy: registrableDomain gives a site and its subdomains one clock', async () => {
            const manager = new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: 'all',
                minCrawlDelaySecs: 60,
                throttleBy: 'registrableDomain',
            });

            await manager.addRequest({ url: 'https://a.example.com/1' });
            await manager.addRequest({ url: 'https://b.example.com/1' });

            expect((await manager.fetchNextRequest())!.url).toBe('https://a.example.com/1');
            // A different host, but the same site - so it waits out the delay rather than doubling the rate.
            expect(await manager.fetchNextRequest()).toBeNull();
            expect(domainState(manager, 'example.com')).toBeDefined();
        });

        test('hosts with no registrable domain are still paced per hostname', async () => {
            const manager = new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: 'all',
                minCrawlDelaySecs: 60,
                throttleBy: 'registrableDomain',
            });

            await manager.addRequest({ url: 'http://127.0.0.1:8080/1' });
            await manager.addRequest({ url: 'http://localhost:8080/1' });

            expect(await manager.fetchNextRequest()).not.toBeNull();
            // Two hosts that tldts cannot reduce to a common site, so they do not share a queue either.
            expect(await manager.fetchNextRequest()).not.toBeNull();
        });

        test('refuses to throttle more domains than maxThrottledDomains', async () => {
            const manager = new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: 'all',
                maxThrottledDomains: 2,
            });

            await manager.addRequest({ url: 'https://one.com/1' });
            await manager.addRequest({ url: 'https://two.com/1' });

            await expect(manager.addRequest({ url: 'https://three.com/1' })).rejects.toThrow(/maxThrottledDomains/);
        });

        test('a batch that overflows maxThrottledDomains still stores the requests that fit', async () => {
            const manager = new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: 'all',
                maxThrottledDomains: 50,
            });

            const urls = Array.from({ length: 100 }, (_, i) => `https://${i}.com`);
            const error = await manager.addRequestsBatched(urls).catch((e: Error) => e);

            expect(error).toBeInstanceOf(Error);
            // The other 49 domains that did not fit either are named, not just the first one to overflow.
            expect((error as Error).message).toMatch(/49 other new domain\(s\)/);
            expect(await manager.getTotalCount()).toBe(50);
        });

        test('a restart reopens the queues of domains the previous run discovered', async () => {
            const firstRun = new ThrottlingRequestManager({ inner: await createQueue(), domains: 'all' });
            await firstRun.addRequest({ url: 'https://example.com/left-behind' });

            // A restart builds a brand new manager over the same storage backend, with nothing but the
            // persisted domain list to tell it that queue exists.
            const secondRun = new ThrottlingRequestManager({ inner: await createQueue(), domains: 'all' });

            expect(await secondRun.getPendingCount()).toBe(1);
            expect((await pollForNextRequest(secondRun)).url).toBe('https://example.com/left-behind');
        });

        test('a domain is recorded before its first request lands in the sub-queue', async () => {
            const order: string[] = [];
            const store = await KeyValueStore.open();
            vitest.spyOn(store, 'setValue').mockImplementation(async () => {
                order.push('persist');
            });

            const manager = new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: 'all',
                requestManagerOpener: async (identifier, options) => {
                    const queue = await RequestQueue.open(identifier, options);
                    const addRequest = queue.addRequest.bind(queue);
                    queue.addRequest = async (...args) => {
                        order.push('add');
                        return addRequest(...args);
                    };
                    return queue;
                },
            });

            await manager.addRequest({ url: 'https://example.com/1' });

            // The other order would let a crash strand that request in a queue nothing knows to reopen.
            expect(order).toEqual(['persist', 'add']);
        });
    });

    test('recordPacingSignal sets crawl-delay successfully', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({
            inner,
            domains: ['example.com'],
        });

        manager.recordPacingSignal({
            url: 'https://example.com/1',
            reason: 'minInterval',
            intervalMs: 200,
            scope: 'hostname',
        });

        await manager.addRequest({ url: 'https://example.com/1' });
        await manager.addRequest({ url: 'https://example.com/2' });

        const req1 = await manager.fetchNextRequest();
        expect(req1!.url).toBe('https://example.com/1');

        // Dispatching req1 pushes example.com's next slot 200ms out.
        const start = Date.now();
        const req2 = await pollForNextRequest(manager);

        expect(Date.now() - start).toBeGreaterThanOrEqual(150);
        expect(req2.url).toBe('https://example.com/2');
    });

    describe('pacing signal scope', () => {
        test('a signal narrower than the grouping is honoured across the whole group', async () => {
            // robots.txt is per-origin, so a `Crawl-delay` read from one subdomain is hostname-scoped - and the
            // manager holds one queue per group, so it cannot hold a single host back.
            const manager = new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: 'all',
                throttleBy: 'registrableDomain',
            });

            expect(
                manager.recordPacingSignal({
                    url: 'https://a.example.com/robots.txt',
                    reason: 'minInterval',
                    intervalMs: 60_000,
                    scope: 'hostname',
                }),
            ).toBe(true);

            // The sibling subdomain is paced by it too - over-applied, never under-applied.
            await manager.addRequest({ url: 'https://b.example.com/1' });
            await manager.addRequest({ url: 'https://b.example.com/2' });

            expect((await manager.fetchNextRequest())!.url).toBe('https://b.example.com/1');
            expect(await manager.fetchNextRequest()).toBeNull();
        });

        test('a signal wider than the grouping throws instead of being under-applied', async () => {
            // Pacing one host would leave its siblings running flat out, so the manager refuses rather than pretend.
            const manager = new ThrottlingRequestManager({ inner: await createQueue(), domains: 'all' });

            expect(() =>
                manager.recordPacingSignal({
                    url: 'https://a.example.com/1',
                    reason: 'minInterval',
                    intervalMs: 60_000,
                    scope: 'registrableDomain',
                }),
            ).toThrow(/groups requests by "hostname".*throttleBy: "registrableDomain"/s);
        });

        test('a scope it does not speak throws', async () => {
            const manager = new ThrottlingRequestManager({ inner: await createQueue(), domains: 'all' });

            // A per-account limit is a real thing to be told about, but this manager keys on hostnames.
            expect(() =>
                manager.recordPacingSignal({ url: 'https://example.com/1', reason: 'rateLimited', scope: 'account' }),
            ).toThrow(/only understands the scopes "hostname" and "registrableDomain"/);
        });

        test('an unscoped signal is applied at the grouping, whatever that is', async () => {
            // A 429 does not say whether the limit was per host, per account or per address, so nothing is declared.
            const manager = new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: 'all',
                throttleBy: 'registrableDomain',
            });

            await manager.addRequest({ url: 'https://a.example.com/1' });
            expect(manager.recordPacingSignal({ url: 'https://a.example.com/1', reason: 'rateLimited' })).toBe(true);

            await expect(manager.checkReadiness()).resolves.toMatchObject({ status: 'waiting' });
        });
    });

    describe("reason: 'minIntervalEverywhere'", () => {
        const floor = (intervalMs: number, scope = 'registrableDomain' as const) =>
            ({ reason: 'minIntervalEverywhere', intervalMs, scope }) as const;

        test('paces every domain the manager covers, declared or not', async () => {
            const manager = new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: 'all',
                throttleBy: 'registrableDomain',
            });

            expect(manager.recordPacingSignal(floor(60_000))).toBe(true);

            await manager.addRequest({ url: 'https://example.com/1' });
            await manager.addRequest({ url: 'https://example.com/2' });

            expect((await manager.fetchNextRequest())!.url).toBe('https://example.com/1');
            expect(await manager.fetchNextRequest()).toBeNull();
        });

        test('is a floor, so a longer configured delay stands', async () => {
            const manager = new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: 'all',
                throttleBy: 'registrableDomain',
                minCrawlDelaySecs: 60,
            });

            expect(manager.recordPacingSignal(floor(1_000))).toBe(true);

            await manager.addRequest({ url: 'https://example.com/1' });
            await manager.fetchNextRequest();

            // The dispatch armed the configured minute, not the second it was just handed.
            expect(domainState(manager, 'example.com').crawlDelayUntil).toBeGreaterThan(Date.now() + 30_000);
        });

        test('a manager that paces nothing reports it as unhandled', async () => {
            // Answering `false` rather than throwing is what lets a caller pace it from the outside instead.
            const manager = new ThrottlingRequestManager({ inner: await createQueue(), domains: [] });

            expect(manager.recordPacingSignal(floor(1_000))).toBe(false);
        });

        test('a manager that paces only some domains throws instead of leaving the rest unpaced', async () => {
            const manager = new ThrottlingRequestManager({
                inner: await createQueue(),
                domains: ['example.com'],
                throttleBy: 'registrableDomain',
            });

            expect(() => manager.recordPacingSignal(floor(1_000))).toThrow(/domains: 'all'/);
        });

        test('a floor at a finer grain than the grouping throws, like any other signal', async () => {
            const manager = new ThrottlingRequestManager({ inner: await createQueue(), domains: 'all' });

            expect(() => manager.recordPacingSignal(floor(1_000))).toThrow(/groups requests by "hostname"/);
        });
    });
});
