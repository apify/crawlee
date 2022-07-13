import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    // Function called for each URL
    async requestHandler({ request, $ }) {
        const title = $('title').text();
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
