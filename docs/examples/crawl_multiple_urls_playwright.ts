import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    // Function called for each URL
    async requestHandler({ request, page }) {
        const title = await page.title();
        console.log(`URL: ${request.url}\nTITLE: ${title}`);
    },
});

await crawler.addRequests([
    'http://www.example.com/page-1',
    'http://www.example.com/page-2',
    'http://www.example.com/page-3',
]);

// Run the crawler
await crawler.run();
