import { initialize, getActorTestDir, runActor, expect, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, 16384);

await expect(stats.requestsFinished === 2, 'All requests finished');
await expect(datasetItems.length === 1, 'Number of dataset items');
await expect(
    validateDataset(datasetItems, ['url', 'title', 'uniqueIdentifier', 'description', 'modifiedDate']),
    'Dataset items validation',
);
