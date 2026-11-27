import type * as Basic from '@crawlee/basic';

// Fresh modules reset the per-process id counters, so the crawler index and the standalone component ids all start at `0`.
async function importFresh(): Promise<typeof Basic> {
    vitest.resetModules();
    const basic = await import('@crawlee/basic');
    basic.serviceLocator.setStorageBackend(new basic.MemoryStorageBackend());
    return basic;
}

describe('components built by a crawler without an id', () => {
    test('do not share per-domain queues with a standalone ThrottlingRequestManager', async () => {
        const { BasicCrawler, RequestQueue, ThrottlingRequestManager } = await importFresh();
        const userManager = new ThrottlingRequestManager({
            inner: await RequestQueue.open({ alias: 'user-inner' }),
            domains: ['example.com'],
        });
        const crawler = new BasicCrawler({ sameDomainDelaySecs: 1, requestHandler: async () => {} });

        await crawler.addRequests(['https://example.com/belongs-to-the-crawler']);

        expect(await userManager.getPendingCount()).toBe(0);
    });

    test('do not share the persisted state of a standalone SessionPool', async () => {
        const { BasicCrawler, KeyValueStore, SessionPool } = await importFresh();
        const userPool = new SessionPool({ maxPoolSize: 1 });
        const userSession = await userPool.getSession();
        const crawler = new BasicCrawler({ requestHandler: async () => {} });
        await crawler.run(['https://example.com']);

        await userPool.persistState();
        await (crawler.sessionPool as Basic.SessionPool).persistState();

        const store = await KeyValueStore.open();
        const record = await store.getValue<{ sessions: { id: string }[] }>(
            `CRAWLEE_SESSION_POOL_STATE_${userPool.id}`,
        );
        expect(record!.sessions.map((s) => s.id)).toEqual([userSession!.id]);
    });

    test('do not share the persistence key of a standalone Statistics', async () => {
        const { BasicCrawler, Statistics } = await importFresh();
        const userStatistics = new Statistics();
        const crawler = new BasicCrawler({ requestHandler: async () => {} });

        expect((crawler.statistics as Basic.Statistics).id).not.toBe(userStatistics.id);
    });
});
