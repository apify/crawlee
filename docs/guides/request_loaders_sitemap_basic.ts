import { SitemapRequestLoader } from 'crawlee';

// Open a sitemap request list. The sitemap is fetched and parsed in the background,
// so crawling can start before the whole sitemap is loaded.
const sitemapRequestLoader = await SitemapRequestLoader.open({
    sitemapUrls: ['https://crawlee.dev/sitemap.xml'],
    // Optionally filter the URLs read from the sitemap:
    // globs: ['https://crawlee.dev/docs/**'],
});

for await (const request of sitemapRequestLoader) {
    console.log(request.url);
    await sitemapRequestLoader.markRequestAsHandled(request);
}
