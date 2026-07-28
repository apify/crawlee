import { initialize, getActorTestDir, runActor, expect, skipTest } from '../tools.mjs';

// The actor spins up an HTTP server on 127.0.0.1; that works inside the
// in-process LOCAL/MEMORY worker but is unreachable from the Apify platform
// container, so the run never finishes. robots.txt handling is crawler logic
// that doesn't depend on the storage backend, so LOCAL+MEMORY coverage is
// sufficient.
if (process.env.STORAGE_IMPLEMENTATION === 'PLATFORM') {
    await skipTest('localhost fixture is not reachable from the Apify platform');
}

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, 16384);

// Without this the two assertions below hold vacuously when the crawl never starts.
await expect(stats.requestsFinished >= 1, 'All requests finished');

const paths = datasetItems.map((item) => new URL(item.url).pathname);

await expect(!paths.includes('/cart'), '/cart URL is not processed');
await expect(!paths.includes('/checkout'), '/checkout URL is not processed');
