import { initialize, getActorTestDir, runActor, expect, validateDataset, skipTest } from '../tools.mjs';

if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
    await skipTest('TODO(vladfrangu): bring in the local storage implementation for request locking');
}

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

await expect(stats.requestsFinished > 40, 'All requests finished');
await expect(datasetItems.length > 40, 'Number of dataset items');
await expect(validateDataset(datasetItems, ['url', 'pageTitle']), 'Dataset items validation');
