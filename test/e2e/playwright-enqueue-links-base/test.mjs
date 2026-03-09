import { expect, getActorTestDir, initialize, runActor, skipTest } from '../tools.mjs';

await skipTest('too flaky');

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname);

await expect(datasetItems.length === 14, `Enqueueing respects <base href>`);
