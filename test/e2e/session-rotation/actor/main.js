import { Actor } from 'apify';
import { PlaywrightCrawler, Session, SessionPool } from '@crawlee/playwright';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

await Actor.main(async () => {
    const crawler = new PlaywrightCrawler({
        maxRequestRetries: 10,
        sessionPool: new SessionPool({
            createSessionFunction: async (opts) =>
                new Session({
                    ...opts?.sessionOptions,
                    maxErrorScore: 2,
                }),
        }),
        requestHandler: async ({ session, registerDeferredCleanup }) => {
            // The handler runs in a storage transaction, so a plain pushData would be rolled
            // back when the handler throws. Deferred cleanups run outside of it.
            const { id, usageCount, errorScore } = session;
            registerDeferredCleanup(async () => {
                await Actor.pushData({ id, usageCount, errorScore });
            });
            throw new Error('retry');
        },
    });

    await crawler.run(['https://crawlee.dev/']);
}, mainOptions);
