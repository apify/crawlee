import { CheerioCrawler, Statistics } from 'crawlee';
import { z } from 'zod';

const statistics = new Statistics({
    id: 'product-crawler',
    defaultState: { productsFound: 0, lastCategory: null as string | null },
    // Validates the two fields above when they are restored from the key-value store. A record written by an
    // older version of this crawler that no longer fits the schema is discarded in favour of the defaults.
    stateSchema: z.object({
        productsFound: z.number().int().nonnegative(),
        lastCategory: z.string().nullable(),
    }),
});

const crawler = new CheerioCrawler({
    statistics,
    async requestHandler({ $, request }) {
        statistics.state.productsFound += $('.product').length;
        statistics.state.lastCategory = request.label ?? null;
    },
});

await crawler.run(['https://crawlee.dev']);
