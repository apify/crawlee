import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from '@crawlee/cheerio';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new (await import('@apify/storage-local')).ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new CheerioCrawler({
        maxRequestsPerCrawl: 30,
        proxyConfiguration: await Actor.createProxyConfiguration(),
        async requestHandler({ $, enqueueLinks, request, log }) {
            const { url, loadedUrl } = request;

            const pageTitle = $('title').first().text();
            log.info(`URL: ${url}; LOADED_URL: ${loadedUrl}; TITLE: ${pageTitle}`);
            await Dataset.pushData({ url, loadedUrl, pageTitle });

            await enqueueLinks({
                globs: [
                    'https://www.jamesallen.com/about-us/**',
                    'https://www.jamesallen.com/terms-of-use/**',
                    'https://www.jamesallen.com/guarantee/**',
                ],
            });
        },
    });

    await crawler.run(['https://www.jamesallen.com/faq/']);
}, mainOptions);
