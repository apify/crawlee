import { initialize, getActorTestDir, runActor, expect } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname, 16384);

await expect(datasetItems.length === 1, 'Has dataset items');

for (const { isBlocked } of datasetItems) {
    await expect(!isBlocked, 'Is not blocked');
}
