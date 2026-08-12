import type { AddRequestsBatchedResult } from '@crawlee/core';
import {
    KeyValueStore,
    MemoryStorageBackend,
    PersistentRateLimitError,
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

    test('addRequestsBatched keeps isFinished false while background batches are landing', async () => {
        const inner = await createQueue();
        // Reports itself done the moment each batch lands, so only our own batch bookkeeping can hold the crawl open.
        const eagerlyFinished = {
            ...inner,
            addRequestsBatched: inner.addRequestsBatched.bind(inner),
            getTotalCount: inner.getTotalCount.bind(inner),
            isEmpty: async () => true,
            isFinished: async () => true,
        } as unknown as RequestQueue;

        const manager = new ThrottlingRequestManager({ inner: eagerlyFinished, domains: [] });

        const result = await manager.addRequestsBatched(
            [{ url: 'https://other.com/1' }, { url: 'https://other.com/2' }],
            { batchSize: 1, waitBetweenBatchesMillis: 0 },
        );

        // The inner manager reports itself finished as soon as its own batch lands, but ours must not -
        // there is still a batch in flight behind it.
        expect(await manager.isFinished()).toBe(false);

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
        expect(await manager.isFinished()).toBe(true);
        expect(await inner.getPendingCount()).toBe(0);
    });

    test('recordDomainDelay enforces throttling and fair scheduling', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({
            inner,
            domains: ['example.com', 'foo.com'],
            baseDelaySecs: 0.1,
        });

        await manager.addRequest({ url: 'https://example.com/1' });
        await manager.addRequest({ url: 'https://foo.com/1' });

        // Record a 500ms delay on example.com
        const recorded = manager.recordDomainDelay('https://example.com/1', 500);
        expect(recorded).toBe(true);

        // Fetch next request - should fetch foo.com since example.com is throttled
        const req1 = await manager.fetchNextRequest();
        expect(req1!.url).toBe('https://foo.com/1');

        // example.com is still throttled and inner is empty, so there is nothing to fetch right now -
        // and the manager must say so rather than block the caller.
        expect(await manager.fetchNextRequest()).toBeNull();
        expect(await manager.isEmpty()).toBe(true);
        // ...while still reporting the throttled request as outstanding work.
        expect(await manager.isFinished()).toBe(false);

        const start = Date.now();
        const req2 = await pollForNextRequest(manager);

        expect(Date.now() - start).toBeGreaterThanOrEqual(400);
        expect(req2.url).toBe('https://example.com/1');
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
            expect(manager.recordDomainDelay('https://example.com/1')).toBe(true);
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

        manager.recordDomainDelay('https://example.com/1');

        // Rewinding both clocks beats sleeping out real delays - a loaded CI box cannot race it.
        const rewind = (ms: number) => {
            state.backoffUntil -= ms;
            state.backoffDecaysAt -= ms;
        };

        // Past the backoff but still inside the decay window: the next 429 continues the same burst.
        rewind(11_000);
        manager.recordDomainDelay('https://example.com/1');
        expect(state.consecutive429Count).toBe(2);

        // Past the decay window as well: the domain is treated as recovered and the exponent restarts.
        rewind(41_000);
        manager.recordDomainDelay('https://example.com/1');
        expect(state.consecutive429Count).toBe(1);
    });

    test('caps the delay at maxDelaySecs', async () => {
        const manager = new ThrottlingRequestManager({
            inner: await createQueue(),
            domains: ['example.com'],
            maxDelaySecs: 1,
        });

        manager.recordDomainDelay('https://example.com/1', 3_600_000);

        expect(domainState(manager, 'example.com').backoffUntil).toBeLessThanOrEqual(Date.now() + 1000);
    });

    test('fetchNextRequest does not block while a domain is throttled', async () => {
        const manager = new ThrottlingRequestManager({
            inner: await createQueue(),
            domains: ['example.com'],
            maxDelaySecs: 60,
        });

        await manager.addRequest({ url: 'https://example.com/1' });
        manager.recordDomainDelay('https://example.com/1', 60_000);

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

        expect(await secondRun.isEmpty()).toBe(false);
        expect(await secondRun.isFinished()).toBe(false);
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
            manager.recordDomainDelay('https://example.com/1');

            await expect(manager.assertNoStalledDomains()).resolves.toBeUndefined();

            stallFor(manager, 'example.com');
            await expect(manager.assertNoStalledDomains()).rejects.toThrow(PersistentRateLimitError);
        });

        test('a handled request resets the clock', async () => {
            const manager = await stallingManager();
            await manager.addRequest({ url: 'https://example.com/1' });
            await manager.addRequest({ url: 'https://example.com/2' });
            manager.recordDomainDelay('https://example.com/1');
            stallFor(manager, 'example.com');

            await manager.markRequestAsHandled((await pollForNextRequest(manager))!);

            await expect(manager.assertNoStalledDomains()).resolves.toBeUndefined();
        });

        test('a domain that has run out of work is finished, not stalled', async () => {
            const manager = await stallingManager();
            manager.recordDomainDelay('https://example.com/1');
            stallFor(manager, 'example.com');

            await expect(manager.assertNoStalledDomains()).resolves.toBeUndefined();
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
            manager.recordDomainDelay('https://example.com/1');

            await expect(manager.assertNoStalledDomains()).resolves.toBeUndefined();
        });

        test('a domain that was never rate-limited is never stalled', async () => {
            const manager = await stallingManager();
            await manager.addRequest({ url: 'https://example.com/1' });

            await expect(manager.assertNoStalledDomains()).resolves.toBeUndefined();
        });

        test('a domain that stopped rate-limiting a while ago is being waited out, not stalled', async () => {
            const manager = await stallingManager();
            await manager.addRequest({ url: 'https://example.com/1' });

            // A single old 429, and nothing since - which is what a `Crawl-delay` longer than the stall window
            // looks like. The domain is not turning us away, we are keeping our distance from it.
            manager.recordDomainDelay('https://example.com/1');
            stallFor(manager, 'example.com');
            domainState(manager, 'example.com').lastRateLimitedAt -= 60_000;

            await expect(manager.assertNoStalledDomains()).resolves.toBeUndefined();
        });
    });

    test('a crawl-delay does not swallow the 429 backoff', async () => {
        const manager = new ThrottlingRequestManager({
            inner: await createQueue(),
            domains: ['example.com'],
        });

        manager.setCrawlDelay('https://example.com/1', 5);
        await manager.addRequest({ url: 'https://example.com/1' });
        await manager.addRequest({ url: 'https://example.com/2' });

        // Dispatching arms the crawl-delay, which used to read as an already-active backoff.
        await manager.fetchNextRequest();
        expect(manager.recordDomainDelay('https://example.com/1', 30_000)).toBe(true);

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

        manager.setCrawlDelay('https://example.com/1', 60);
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

        manager.setCrawlDelay('https://example.com/1', 60);

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

            expect(manager.recordDomainDelay('https://example.com/1', 60_000)).toBe(true);
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
            expect(manager.setCrawlDelay('https://example.com/robots.txt', 60)).toBe(true);

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

    test('setCrawlDelay sets crawl-delay successfully', async () => {
        const inner = await createQueue();
        const manager = new ThrottlingRequestManager({
            inner,
            domains: ['example.com'],
        });

        manager.setCrawlDelay('https://example.com/1', 0.2); // 0.2 seconds = 200ms

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
});
