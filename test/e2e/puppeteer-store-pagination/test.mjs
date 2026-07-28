import { initialize, getActorTestDir, runActor, expect, skipTest, validateDataset } from '../tools.mjs';

// The actor spins up an HTTP server on 127.0.0.1; that works inside the
// in-process LOCAL/MEMORY worker but is unreachable from the Apify platform
// container, so the run never finishes. Pagination and extraction are crawler
// logic that doesn't depend on the storage backend, so LOCAL+MEMORY coverage
// is sufficient.
if (process.env.STORAGE_IMPLEMENTATION === 'PLATFORM') {
    await skipTest('localhost fixture is not reachable from the Apify platform');
}

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, 16384);

await expect(stats.requestsFinished >= 10, 'All requests finished');
await expect(datasetItems.length > 5 && datasetItems.length < 15, 'Number of dataset items');
await expect(
    validateDataset(datasetItems, ['manufacturer', 'title', 'sku', 'currentPrice', 'availableInStock']),
    'Dataset items validation',
);
// `url` is checked separately: validateDataset matches it against a regex that
// rejects the fixture's 127.0.0.1 origin.
await expect(
    datasetItems.every((item) => URL.canParse(item.url) && new URL(item.url).pathname.startsWith('/products/')),
    'Dataset items have product URLs',
);
