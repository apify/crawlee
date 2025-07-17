import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 20,
    async requestHandler({ $, request, enqueueLinks }) {
        const title = $('title').text();
        console.log(`The title of "${request.url}" is: ${title}.`);
        // The default behavior of enqueueLinks is to stay on the same domain,
        // so it does not require any parameters.
        // This ensures URLs on the same domain are enqueued, regardless of
        // subdomain differences.
        await enqueueLinks();
    },
});

await crawler.run(['https://crawlee.dev']);
