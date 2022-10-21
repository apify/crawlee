import { initialize, getActorTestDir, runActor, expect, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname);

await expect(datasetItems.length === 2, 'Number of dataset items');
await expect(validateDataset(datasetItems, ['url']), 'Dataset items validation');
await expect(datasetItems[0].url !== datasetItems[1].url, 'Dataset items unique');
