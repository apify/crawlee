import { AdaptivePlaywrightCrawler, adaptivePlaywrightCrawlerStatisticState, Statistics } from 'crawlee';
import { z } from 'zod';

const statistics = new Statistics({
    stateExtension: {
        // The adaptive crawler tracks fields of its own, so an injected instance has to carry them too.
        deserialize: adaptivePlaywrightCrawlerStatisticState.deserialize.extend({
            productsFound: z.number().default(0),
        }),
    },
});

const crawler = new AdaptivePlaywrightCrawler({
    statistics,
    async requestHandler({ querySelectorAll }) {
        statistics.state.productsFound += (await querySelectorAll('.product')).length;
    },
});

await crawler.run(['https://crawlee.dev']);

console.log(`Handled ${crawler.statistics.state.httpOnlyRequestHandlerRuns} requests without a browser`);
