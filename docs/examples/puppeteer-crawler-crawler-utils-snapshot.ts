import { PuppeteerCrawler } from 'crawlee';

// Create a PuppeteerCrawler
const crawler = new PuppeteerCrawler({
    async requestHandler({ request, saveSnapshot }) {
        // Convert the URL into a valid key
        const key = request.url.replace(/[:/]/g, '_');
        // Capture the screenshot
        await saveSnapshot({ key, saveHtml: false });
    },
});

await crawler.addRequests([
    { url: 'http://www.example.com/page-1' },
    { url: 'http://www.example.com/page-2' },
    { url: 'http://www.example.com/page-3' },
]);

// Run the crawler
await crawler.run();
