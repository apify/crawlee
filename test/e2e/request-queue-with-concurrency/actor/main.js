import { BasicCrawler } from '@crawlee/basic';
import { RequestQueue } from '@crawlee/core';
import { log } from '@crawlee/core';
import { Actor } from 'apify';
import { setTimeout } from 'node:timers/promises';

log.setLevel(log.LEVELS.DEBUG);

process.env.CRAWLEE_INTERNAL_TIMEOUT = '30000';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

await Actor.main(async () => {
    const input = await Actor.getInputOrThrow();

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
