import { CheerioCrawler, EnqueueStrategy } from 'crawlee';

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 10, // Limitation for only 10 requests (do not use if you want to crawl all links)
    async requestHandler({ request, enqueueLinks }) {
        console.log(request.url);
        await enqueueLinks({
            // Setting the strategy to 'same-domain' will enqueue all links found that are on the
            // same hostname as request.loadedUrl or request.url
            // highlight-next-line
            strategy: EnqueueStrategy.SameDomain,
            // Alternatively, you can pass in the string 'same-domain'
            // strategy: 'same-domain',
        });
    },
});

await crawler.addRequests(['https://apify.com/']);

// Run the crawler
await crawler.run();
