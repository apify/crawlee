import { initialize, getActorTestDir, runActor, expect, skipTest } from '../tools.mjs';

if (process.env.STORAGE_IMPLEMENTATION === 'PLATFORM') {
    await skipTest('TODO fails to build the docker image now');
}

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname, 16384);

await expect(datasetItems.length === 1, 'Has dataset items');

for (const { isBlocked } of datasetItems) {
    await expect(!isBlocked, 'Is not blocked');
}
