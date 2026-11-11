import { CheerioCrawler, Statistics } from 'crawlee';
import { z } from 'zod';

const statistics = new Statistics({
    stateExtension: {
        // A default per field means the schema is the only place the fields are declared.
        deserialize: z.object({
            productsFound: z.number().default(0),
            lastSeenAt: z.coerce.date().default(() => new Date()),
        }),
        // `Date` is not JSON - this is how it gets into the record for `z.coerce.date()` to read back.
        serialize: ({ productsFound, lastSeenAt }) => ({
            productsFound,
            lastSeenAt: lastSeenAt.toISOString(),
        }),
    },
});

const crawler = new CheerioCrawler({
    statistics,
    async requestHandler({ $ }) {
        statistics.state.productsFound += $('.product').length;
        statistics.state.lastSeenAt = new Date();
    },
});

await crawler.run(['https://crawlee.dev']);
