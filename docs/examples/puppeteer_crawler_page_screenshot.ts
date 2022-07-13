import { PuppeteerCrawler, KeyValueStore } from 'crawlee';

const keyValueStore = await KeyValueStore.open();

// Create a PuppeteerCrawler
const crawler = new PuppeteerCrawler({
    async requestHandler({ request, page }) {
        // Capture the screenshot with Puppeteer
        const screenshot = await page.screenshot();
        // Convert the URL into a valid key
        const key = request.url.replace(/[:/]/g, '_');
        // Save the screenshot to the default key-value store
        await keyValueStore.setValue(key, screenshot, { contentType: 'image/png' });
    },
});

await crawler.addRequests([
    { url: 'http://www.example.com/page-1' },
    { url: 'http://www.example.com/page-2' },
    { url: 'http://www.example.com/page-3' },
]);

// Run the crawler
await crawler.run();
