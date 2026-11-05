import { CheerioCrawler, EnqueueStrategy } from 'crawlee';

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 10, // Limitation for only 10 requests (do not use if you want to crawl all links)
    async requestHandler({ request, enqueueLinks, log }) {
        log.info(request.url);
        await enqueueLinks({
            // Setting the strategy to 'same-hostname' will enqueue all links found that are on the
            // same hostname (including subdomain) as request.loadedUrl or request.url
            // highlight-next-line
            strategy: EnqueueStrategy.SameHostname,
            // Alternatively, you can pass in the string 'same-hostname'
            // strategy: 'same-hostname',
        });
    },
});

// Run the crawler with initial request
await crawler.run(['https://crawlee.dev']);
