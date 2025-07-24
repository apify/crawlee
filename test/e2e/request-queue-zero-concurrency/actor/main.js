import { CheerioCrawler, log, RequestQueueV1 } from '@crawlee/cheerio';
import { Actor } from 'apify';

log.setLevel(log.LEVELS.DEBUG);

process.env.CRAWLEE_INTERNAL_TIMEOUT = '30000';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

// RequestQueue auto-reset when stuck with requests in progress
await Actor.main(async () => {
    const requestQueue = await RequestQueueV1.open();
    await requestQueue.addRequest({ url: 'https://crawlee.dev/?q=1' });
    await requestQueue.addRequest({ url: 'https://crawlee.dev/?q=2' });
    const r3 = await requestQueue.addRequest({ url: 'https://crawlee.dev/?q=3' });
    // trigger 0 concurrency by marking one of the requests as already in progress
    requestQueue.inProgress.add(r3.requestId);

    const crawler = new CheerioCrawler({
        requestQueue,
        async requestHandler({ request }) {
            log.info(request.id);
        },
    });

    await crawler.run();
}, mainOptions);
