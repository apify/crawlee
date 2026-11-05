import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    preNavigationHooks: [
        async ({ request, skipRequest }) => {
            // Decide before the page is even downloaded
            if (request.url.endsWith('.pdf')) skipRequest('not a web page');
        },
    ],
    async requestHandler({ request, $, enqueueLinks, pushData, skipRequest }) {
        // Or after looking at the content
        if ($('meta[name="robots"][content*="noindex"]').length) skipRequest('noindex');

        await pushData({ url: request.url, title: $('title').text() });
        await enqueueLinks();
    },
    async errorHandler({ skipRequest }, error) {
        // Or instead of retrying a request that can never succeed
        if (error.message.includes('404')) skipRequest('page is gone');
    },
    onSkippedRequest({ request, reason, message }) {
        // `reason` is 'manual' for skipRequest(), `message` is what was passed to it
        console.log(`Skipped ${request.url} (${reason}): ${message}`);
    },
    maxRequestsPerCrawl: 20,
});

await crawler.run(['https://crawlee.dev']);
