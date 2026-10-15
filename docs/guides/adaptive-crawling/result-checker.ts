import { AdaptivePlaywrightCrawler } from 'crawlee';

const crawler = new AdaptivePlaywrightCrawler({
    // Prices are rendered client-side on some pages - an empty one means the HTTP-only run missed it.
    resultChecker: ({ datasetItems }) => datasetItems.every(({ item }) => item.price !== ''),
    async requestHandler({ request, querySelectorOne, pushData }) {
        const $price = await querySelectorOne('.price');

        await pushData({ url: request.loadedUrl, price: $price.text().trim() });
    },
});

await crawler.run(['https://warehouse-theme-metal.myshopify.com/collections/sales']);
