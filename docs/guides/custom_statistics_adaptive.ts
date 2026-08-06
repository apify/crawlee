import { AdaptivePlaywrightCrawler, defaultAdaptivePlaywrightCrawlerStatisticState, Statistics } from 'crawlee';

const statistics = new Statistics({
    defaultState: {
        // The adaptive crawler tracks fields of its own, so an injected instance has to carry them too.
        ...defaultAdaptivePlaywrightCrawlerStatisticState,
        productsFound: 0,
    },
});

const crawler = new AdaptivePlaywrightCrawler({
    statistics,
    async requestHandler({ querySelectorAll }) {
        statistics.state.productsFound += (await querySelectorAll('.product')).length;
    },
});

await crawler.run(['https://crawlee.dev']);

console.log(`Handled ${crawler.stats.state.httpOnlyRequestHandlerRuns} requests without a browser`);
