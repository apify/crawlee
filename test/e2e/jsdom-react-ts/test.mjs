import { initialize, getActorTestDir, runActor, expect, validateDataset, skipTest } from '../tools.mjs';

await skipTest('target site no longer exists');

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

await expect(stats.requestsFinished === 1, 'All requests finished');
await expect(datasetItems.length === 1, 'Number of dataset items');
await expect(validateDataset(datasetItems, ['result']), 'Dataset items validation');
await expect(datasetItems[0].result, 'Dataset items');
