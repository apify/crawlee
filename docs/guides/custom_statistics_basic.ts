import { CheerioCrawler, Statistics } from 'crawlee';

// Declare the extra fields and their initial values. Their types flow into `statistics.state`.
const statistics = new Statistics({
    stateExtension: { defaultState: { productsFound: 0 } },
});

const crawler = new CheerioCrawler({
    statistics,
    async requestHandler({ $, enqueueLinks }) {
        statistics.state.productsFound += $('.product').length;

        await enqueueLinks();
    },
});

await crawler.run(['https://crawlee.dev']);

// The custom fields are typed on `crawler.statistics` too.
console.log(`Found ${crawler.statistics.state.productsFound} products`);
