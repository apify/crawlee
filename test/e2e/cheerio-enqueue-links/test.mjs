import { initialize, getActorTestDir, runActor, expect } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname);
const { isEqual } = datasetItems[0];

await expect(isEqual, `Enqueueing on the same subdomain but different loaded url doesn't enqueue`);
