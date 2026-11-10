import type { Session } from '@crawlee/playwright';

import { harness, scenario } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { Actor } = await import('apify');
    const { PlaywrightCrawler, Session, SessionPool } = await import('@crawlee/playwright');

    const mainOptions = { exit: Actor.isAtHome() };

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
                const { id, usageCount, errorScore } = session as Session;
                registerDeferredCleanup(async () => {
                    await Actor.pushData({ id, usageCount, errorScore });
                });
                throw new Error('retry');
            },
        });

        await crawler.run(['https://crawlee.dev/']);
    }, mainOptions);
};

test('session-rotation', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('session-rotation', {
        source: scenario(import.meta.filename, main, { image: 'playwright' }),
        memory: 4096,
    });
    const result = await runActor(actor);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(items, 'retried the correct number of times').toHaveLength(11);
    const usesPerSession = items.map((session) => items.filter((s) => s.id === session.id).length);
    expect(
        usesPerSession.every((uses) => uses <= 2),
        'no session used more than twice',
    ).toBe(true);
});
