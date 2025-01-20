import { CheerioCrawler, Dataset } from '@crawlee/cheerio';
import { Actor } from 'apify';

if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
    // @ts-ignore
    await Actor.init({ storage: new (await import('@apify/storage-local')).ApifyStorageLocal() });
} else {
    await Actor.init();
}

let requestCount = 0;

const crawler = new CheerioCrawler();
crawler.router.addDefaultHandler(async ({ $, enqueueLinks, request, log }) => {
    const { url } = request;
    await enqueueLinks({
        globs: ['https://crawlee.dev/docs/**'],
    });

    const pageTitle = $('title').first().text();
    log.info(`URL: ${url} TITLE: ${pageTitle}`);
    await Dataset.pushData({ url, pageTitle });

    if (requestCount++ > 10) crawler.stop();
});

await crawler.run(['https://crawlee.dev/docs/quick-start']);

requestCount = 0;
await crawler.run(['https://crawlee.dev/docs/quick-start'], { purgeRequestQueue: false });
await Actor.exit({ exit: Actor.isAtHome() });
