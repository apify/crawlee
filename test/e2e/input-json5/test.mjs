import { initialize, getActorTestDir, runActor, expect } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname);

await expect(datasetItems.length === 2, 'Number of dataset items');
await expect(JSON.stringify(datasetItems) === JSON.stringify([
    {
        hello: 'world',
    },
    {
        hello: 'world',
    },
]), 'Dataset items validation');
