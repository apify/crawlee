import assert from 'node:assert';

import { LinkeDOMCrawler, Dataset } from '@crawlee/linkedom';
import { Actor } from 'apify';

if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
    // @ts-ignore
    await Actor.init({ storage: new (await import('@apify/storage-local')).ApifyStorageLocal() });
} else {
    await Actor.init();
}

const crawler = new LinkeDOMCrawler();

crawler.router.addDefaultHandler(async ({ document, enqueueLinks, request, log }) => {
    const { url } = request;
    await enqueueLinks({
        globs: ['https://crawlee.dev/docs/**'],
    });

    const pageTitle = document.querySelector('title')?.textContent ?? '';
    assert.notEqual(pageTitle, '');
    log.info(`URL: ${url} TITLE: ${pageTitle}`);

    await Dataset.pushData({ url, pageTitle });
});

await crawler.run(['https://crawlee.dev/docs/quick-start']);

await Actor.exit({ exit: Actor.isAtHome() });
