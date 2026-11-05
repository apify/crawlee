import { initialize, getActorTestDir, runActor, expect } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname);

await expect(datasetItems.length === 4, `Enqueueing respects <base href>`);
