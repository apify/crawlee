import { Actor } from 'apify';
import { LinkeDOMCrawler, Dataset } from '@crawlee/linkedom';

if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
    const { ApifyStorageLocal } = await import('@apify/storage-local');
    await Actor.init({ storage: new ApifyStorageLocal() });
} else {
    await Actor.init();
}

const crawler = new LinkeDOMCrawler();

crawler.router.addDefaultHandler(async ({ document, enqueueLinks, request, log }) => {
    const { url } = request;
    await enqueueLinks({
        globs: ['https://crawlee.dev/docs/**'],
    });

    const pageTitle = document.title;
    log.info(`URL: ${url} TITLE: ${pageTitle}`);

    await Dataset.pushData({ url, pageTitle });
});

await crawler.run(['https://crawlee.dev/docs/quick-start']);

await Actor.exit({ exit: Actor.isAtHome() });
