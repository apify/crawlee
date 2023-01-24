import { initialize, getActorTestDir, runActor, expect, skipTest } from '../tools.mjs';

if (process.env.STORAGE_IMPLEMENTATION === 'PLATFORM') {
    await skipTest('not supported on platform');
}

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname);

await expect(datasetItems.length === 1, 'Number of dataset items');
await expect(JSON.stringify(datasetItems) === JSON.stringify([
    {
        hello: 'world',
    },
]), 'Dataset items validation');
