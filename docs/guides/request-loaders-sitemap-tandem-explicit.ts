import { CheerioCrawler, RequestManagerTandem, RequestQueue, SitemapRequestLoader } from 'crawlee';

// Read the initial URLs from a sitemap.
const sitemapRequestLoader = await SitemapRequestLoader.open({
    sitemapUrls: ['https://crawlee.dev/sitemap.xml'],
});

// A writable queue for requests discovered during the crawl.
const requestQueue = await RequestQueue.open();

const requestManager = new RequestManagerTandem(sitemapRequestLoader, requestQueue);

const crawler = new CheerioCrawler({
    requestManager,
    async requestHandler({ enqueueLinks }) {
        await enqueueLinks();
    },
});

await crawler.run();
