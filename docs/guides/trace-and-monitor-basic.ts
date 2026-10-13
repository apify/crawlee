import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 10,

    async requestHandler({ request, $, enqueueLinks, log }) {
        const title = $('title').text();
        log.info(`Crawled ${request.url}`, { title });

        await enqueueLinks({
            include: ['https://crawlee.dev/**'],
        });
    },
});

await crawler.run(['https://crawlee.dev']);

// The setup file flushes the telemetry on exit.
console.log('Crawl complete. View traces at http://localhost:16686');
