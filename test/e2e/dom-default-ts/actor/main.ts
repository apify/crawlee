import { Actor } from 'apify';
import { DOMCrawler, Dataset } from '@crawlee/dom';
import { ApifyStorageLocal } from '@apify/storage-local';

if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
    await Actor.init({ storage: new ApifyStorageLocal() });
} else {
    await Actor.init();
}

const crawler = new DOMCrawler();

crawler.router.addDefaultHandler(async ({ window, enqueueLinks, request, log }) => {
    const { url } = request;
    await enqueueLinks({
        globs: ['https://crawlee.dev/docs/**'],
    });

    const pageTitle = window.document.title;
    log.info(`URL: ${url} TITLE: ${pageTitle}`);

    await Dataset.pushData({ url, pageTitle });
});

await crawler.run(['https://crawlee.dev/docs/quick-start']);

await Actor.exit({ exit: Actor.isAtHome() });
