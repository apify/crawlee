import { initialize, getActorTestDir, runActor, expect, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, 16384);

await expect(stats.requestsFinished >= 5, 'All requests finished');
await expect(stats.requestsFailed > 20 && stats.requestsFailed < 30, 'Number of failed requests');
await expect(datasetItems.length >= 5 && datasetItems.length < 10, 'Number of dataset items');
await expect(validateDataset(datasetItems, ['url', 'title']), 'Dataset items validation');
