import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    // Function called for each URL
    async requestHandler({ request, $, log }) {
        const title = $('title').text();
        log.info(`URL: ${request.url}\nTITLE: ${title}`);
    },
});

// Run the crawler with initial request
await crawler.run([
    'http://www.example.com/page-1',
    'http://www.example.com/page-2',
    'http://www.example.com/page-3',
]);
