import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    async requestHandler({ request, $, enqueueLinks, pushData, useState }) {
        const state = await useState({ found: 0, limit: 10 });

        const price = $('.price').first().text();
        if (price) {
            await pushData({ url: request.url, price });
            state.found++;
        }

        // Once we have what we came for, stop dispatching new requests. Requests already in
        // flight finish normally and `crawler.run()` resolves; whatever is still queued stays queued.
        if (state.found >= state.limit) {
            crawler.stop('Collected enough prices');
            return;
        }

        await enqueueLinks();
    },
});

await crawler.run(['https://warehouse-theme-metal.myshopify.com/collections']);

// Calling `run()` again with no arguments continues with the requests left in the queue.
// Here we raise the limit first, otherwise the first request would stop the crawler again.
const state = await crawler.useState({ found: 0, limit: 10 });
state.limit = 20;
await crawler.run();
