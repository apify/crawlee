import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from '@crawlee/cheerio';

if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
    await Actor.init({ storage: new (await import('@apify/storage-local')).ApifyStorageLocal() });
} else {
    await Actor.init();
}

const crawler = new CheerioCrawler();

crawler.router.addDefaultHandler(async ({ $, enqueueLinks, request, log }) => {
    const { url } = request;
    await enqueueLinks({
        globs: ['https://crawlee.dev/docs/**'],
    });

    const pageTitle = $('title').first().text();
    log.info(`URL: ${url} TITLE: ${pageTitle}`);

    await Dataset.pushData({ url, pageTitle });
});

await crawler.run(['https://crawlee.dev/docs/quick-start']);

await Actor.exit({ exit: Actor.isAtHome() });
