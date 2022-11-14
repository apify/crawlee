import { initialize, getActorTestDir, runActor, expect, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

await expect(stats.requestsFinished === 1, 'All requests finished');
await expect(datasetItems.length === 1, 'Number of dataset items');
await expect(validateDataset(datasetItems, ['result']), 'Dataset items validation');
await expect(datasetItems[0].result, 'Dataset items');
