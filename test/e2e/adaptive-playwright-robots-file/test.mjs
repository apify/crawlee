import { expect, getActorTestDir, initialize, runActor } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, 16384);

// Without this the two assertions below hold vacuously when the crawl never starts.
await expect(stats.requestsFinished >= 1, 'All requests finished');

const paths = datasetItems.map((item) => new URL(item.url).pathname);

await expect(!paths.includes('/cart'), '/cart URL is not processed');
await expect(!paths.includes('/checkout'), '/checkout URL is not processed');
