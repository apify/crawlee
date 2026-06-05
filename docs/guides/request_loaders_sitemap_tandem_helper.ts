import { CheerioCrawler, SitemapRequestList } from 'crawlee';

// Read the initial URLs from a sitemap.
const sitemapRequestList = await SitemapRequestList.open({
    sitemapUrls: ['https://crawlee.dev/sitemap.xml'],
});

// Pair the loader with the default `RequestQueue` via the `toTandem()` shortcut.
const requestManager = await sitemapRequestList.toTandem();

const crawler = new CheerioCrawler({
    requestManager,
    async requestHandler({ enqueueLinks }) {
        await enqueueLinks();
    },
});

await crawler.run();
