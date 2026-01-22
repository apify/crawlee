import { CheerioCrawler } from 'crawlee';
import { sdk } from './setup.js';

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 10,

    async requestHandler({ request, $, enqueueLinks, log }) {
        const title = $('title').text();
        log.info(`Crawled ${request.url}`, { title });

        await enqueueLinks({
            globs: ['https://crawlee.dev/**'],
        });
    },
});

await crawler.run(['https://crawlee.dev']);

// Ensure all telemetry is flushed before exiting
await sdk.shutdown();
console.log('Crawl complete. View traces at http://localhost:16686');

