import { CheerioCrawler, ConcurrencySystem } from 'crawlee';

// Advanced scaling options live on a pre-configured ConcurrencySystem.
// An injected system's lifecycle is owned by us, not the crawler - `await using` stops it for us
// once we are done with it.
await using concurrencySystem = new ConcurrencySystem({
    // ...
});

const crawler = new CheerioCrawler({
    concurrencySystem,
    // ...
});

await concurrencySystem.start();
await crawler.run(['https://crawlee.dev']);
