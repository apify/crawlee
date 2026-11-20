import type { Session } from '@crawlee/playwright';
import { testActor } from 'apify-test-tools';

import { eachRuntime, scenario } from './harness.js';

export const main = async () => {
    const { Actor } = await import('apify');
    const { PlaywrightCrawler, Session, SessionPool } = await import('@crawlee/playwright');

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
    });
};

const actor = scenario('session-rotation', import.meta.filename, main, { image: 'playwright', memory: 4096 });

eachRuntime((runtime) => {
    testActor(actor, 'rotates sessions', async ({ expect, run }) => {
        const result = await run({ runtime });
        const { items } = await result.getDataset<any>();

        expect(result.status).toBe('SUCCEEDED');
        expect(items, 'retried the correct number of times').toHaveLength(11);
        const usesPerSession = items.map((session) => items.filter((s) => s.id === session.id).length);
        expect(
            usesPerSession.every((uses) => uses <= 2),
            'no session used more than twice',
        ).toBe(true);
    });
});
