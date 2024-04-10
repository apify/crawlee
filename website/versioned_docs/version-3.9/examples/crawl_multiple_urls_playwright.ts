import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    // Function called for each URL
    async requestHandler({ request, page, log }) {
        const title = await page.title();
        log.info(`URL: ${request.url}\nTITLE: ${title}`);
    },
});

// Run the crawler with initial request
await crawler.run([
    'http://www.example.com/page-1',
    'http://www.example.com/page-2',
    'http://www.example.com/page-3',
]);
