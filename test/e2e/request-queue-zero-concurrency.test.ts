import { testActor } from 'apify-test-tools';
import { describe } from 'vitest';

import { getStats, scenario } from './harness.js';

export const main = async () => {
    const { CheerioCrawler, log, RequestQueue } = await import('@crawlee/cheerio');
    const { Actor } = await import('apify');

    log.setLevel(log.LEVELS.DEBUG);

    process.env.CRAWLEE_INTERNAL_TIMEOUT = '30000';

    const mainOptions = { exit: Actor.isAtHome() };

    // RequestQueue auto-reset when stuck with requests in progress
    await Actor.main(async () => {
        const requestQueue = await RequestQueue.open();
        await requestQueue.addRequest({ url: 'https://crawlee.dev/?q=1' });
        await requestQueue.addRequest({ url: 'https://crawlee.dev/?q=2' });
        const r3 = await requestQueue.addRequest({ url: 'https://crawlee.dev/?q=3' });
        // trigger 0 concurrency by marking one of the requests as already in progress
        // @ts-expect-error the v3 client-side `inProgress` set no longer exists; see the skip reason below
        requestQueue.inProgress.add(r3.requestId);

        const crawler = new CheerioCrawler({
            requestQueue,
            async requestHandler({ request }) {
                log.info(request.id);
            },
        });

        await crawler.run();
    }, mainOptions);
};

// TODO(v4): redesign for the v4 RequestQueue. The test stages a stuck queue via the v3
const actor = scenario('request-queue-zero-concurrency', import.meta.filename, main, { memory: 4096 });

// client-side `requestQueue.inProgress` set, which no longer exists in the rewritten queue.
describe.skip('the v4 RequestQueue has no client-side `inProgress` set to stage a stuck queue with', () => {
    testActor(actor, 'recovers a stuck queue', async ({ expect, run }) => {
        const result = await run();
        const stats = await getStats(result);

        expect(result.status).toBe('SUCCEEDED');
        expect(stats.requestsSucceeded).toBe(3);
        // RequestQueue triggers auto-reset after being stuck with requests in progress.
        expect(stats.crawlerRuntimeMillis).toBeGreaterThan(30_000);
        expect(stats.crawlerRuntimeMillis).toBeLessThan(35_000);
    });
});
