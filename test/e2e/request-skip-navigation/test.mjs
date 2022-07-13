import { initialize, getActorTestDir, runActor, expect } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname);
const { requestCounter, navigationCounter } = datasetItems[0];

await expect(requestCounter === 3, 'Processed 3 requests');
await expect(navigationCounter === 1, 'Navigated on 1 request only');
