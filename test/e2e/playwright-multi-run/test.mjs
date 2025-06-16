import { initialize, getActorTestDir, runActor, expect, validateDataset, skipTest } from '../tools.mjs';

if (process.env.STORAGE_IMPLEMENTATION === 'PLATFORM') {
    await skipTest('not supported on platform');
}

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname, 16384);

// we cant assert number of requests as the stats KVS is being wiped on each `run` call, unlike the dataset
await expect(datasetItems.length > 30, `Number of dataset items (actual: ${datasetItems.length}, expected: > 30)`);
await expect(validateDataset(datasetItems, ['url', 'pageTitle']), 'Dataset items validation');
