import { CheerioCrawler, SitemapRequestLoader } from 'crawlee';

// Read the initial URLs from a sitemap.
const sitemapRequestLoader = await SitemapRequestLoader.open({
    sitemapUrls: ['https://crawlee.dev/sitemap.xml'],
});

// Pair the loader with the default `RequestQueue` via the `toTandem()` shortcut.
const requestManager = await sitemapRequestLoader.toTandem();

const crawler = new CheerioCrawler({
    requestManager,
    async requestHandler({ enqueueLinks }) {
        await enqueueLinks();
    },
});

await crawler.run();
