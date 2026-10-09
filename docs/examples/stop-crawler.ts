import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    async requestHandler({ request, $, enqueueLinks, pushData, useState }) {
        const state = await useState({ found: 0 });

        const price = $('.price').first().text();
        if (price) {
            await pushData({ url: request.url, price });
            state.found++;
        }

        // Once we have what we came for, stop dispatching new requests. Requests already in
        // flight finish normally and `crawler.run()` resolves; whatever is still queued stays queued.
        if (state.found >= 10) {
            crawler.stop('Collected enough prices');
            return;
        }

        await enqueueLinks();
    },
});

await crawler.run(['https://warehouse-theme-metal.myshopify.com/collections']);
