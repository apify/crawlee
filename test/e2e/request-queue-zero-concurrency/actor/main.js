import { Actor } from 'apify';
import { CheerioCrawler, log, RequestQueue } from '@crawlee/cheerio';
import { ApifyStorageLocal } from '@apify/storage-local';

log.setLevel(log.LEVELS.DEBUG);

process.env.CRAWLEE_INTERNAL_TIMEOUT = '30000';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

// RequestQueue auto-reset when stuck with requests in progress
await Actor.main(async () => {
    const requestQueue = await RequestQueue.open();
    await requestQueue.addRequest({ url: 'https://example.com/?q=1' });
    await requestQueue.addRequest({ url: 'https://example.com/?q=2' });
    const r3 = await requestQueue.addRequest({ url: 'https://example.com/?q=3' });
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
