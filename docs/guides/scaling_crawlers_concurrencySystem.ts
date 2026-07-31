import { CheerioCrawler, ConcurrencySystem } from 'crawlee';

// Advanced scaling options live on a pre-configured ConcurrencySystem
const concurrencySystem = new ConcurrencySystem({
    // ...
});

const crawler = new CheerioCrawler({
    concurrencySystem,
    // ...
});

// An injected system's lifecycle is owned by us, not the crawler
await concurrencySystem.start();
try {
    await crawler.run(['https://crawlee.dev']);
} finally {
    await concurrencySystem.stop();
}
