import { initialize, expect, validateDataset, getActorTestDir, runActor } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

await expect(stats.requestsFinished > 10, 'All requests finished');
await expect(datasetItems.length > 5 && datasetItems.length < 15, 'Number of dataset items');
await expect(
    validateDataset(datasetItems, ['url', 'title', 'uniqueIdentifier', 'firstParagraph', 'modifiedDate']),
    'Dataset items validation',
);
