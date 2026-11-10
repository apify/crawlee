import { ApifyClient } from 'apify-client';
import { pollUntil } from 'apify-test-tools';

import { harness, scenario, token } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { BasicCrawler } = await import('@crawlee/basic');
    const { RequestQueue } = await import('@crawlee/core');
    const { log } = await import('@crawlee/core');
    const { Actor } = await import('apify');
    const { setTimeout } = await import('node:timers/promises');

    log.setLevel(log.LEVELS.DEBUG);

    process.env.CRAWLEE_INTERNAL_TIMEOUT = '30000';

    const mainOptions = { exit: Actor.isAtHome() };

    await Actor.main(async () => {
        const input = await Actor.getInput<{ queueId: string; limit: number }>();

        log.info('Starting the crawler', input);

        const requestQueue = await RequestQueue.open(input.queueId);

        const crawler = new BasicCrawler({
            requestQueue,
            async requestHandler({ request, addRequests, pushData }) {
                await setTimeout(Math.random() * 200); // Simulate some work

                const url = new URL(request.url);
                const index = Number(url.pathname.slice(1));
                const newUrls = [];

                for (const newIndex of [index + 1, index + 2, 2 * index]) {
                    if (newIndex <= input.limit) {
                        url.pathname = `/${newIndex + 1}`;
                        newUrls.push(url.toString());
                    }
                }

                log.info(`Enqueueing ${newUrls.length} new urls`);
                if (newUrls.length > 0) {
                    await addRequests(newUrls);
                }

                await pushData({ url });
            },
        });

        await crawler.run(['https://example.tld/1']);
    }, mainOptions);
};

test('request-queue-with-concurrency', async ({ expect, createActor, runActor }) => {
    const client = new ApifyClient({ token });
    const actor = await createActor('request-queue-with-concurrency', {
        source: scenario(import.meta.filename, main),
        memory: 4096,
        // The runs share a queue the test owns, which a limited run token can't reach.
        permissions: 'FULL_PERMISSIONS',
    });
    const { id: queueId } = await client.requestQueues().getOrCreate();
    const input = { limit: 1000, queueId };

    const results = await Promise.all(Array.from({ length: 4 }, async () => runActor(actor, input)));
    for (const result of results) expect(result.status).toBe('SUCCEEDED');

    const requestQueue = await pollUntil(
        async () => (await client.requestQueue(queueId).get())!,
        (queue) => queue.pendingRequestCount === 0 && queue.handledRequestCount === 1000,
    );
    expect(requestQueue.pendingRequestCount).toBe(0);
    expect(requestQueue.handledRequestCount).toBe(1000);

    const finishedAt = await Promise.all(
        results.map(async (result) => (await result.getRunInfo()).finishedAt!.valueOf()),
    );
    expect(Math.max(...finishedAt) - Math.min(...finishedAt), 'runs finished at similar times').toBeLessThan(60_000);
});
