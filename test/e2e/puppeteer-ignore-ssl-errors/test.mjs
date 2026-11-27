import { expect, getActorTestDir, initialize, runActor } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, 16384);

await expect(stats.requestsSucceeded === 3, 'All requests finished');
await expect(datasetItems.length === 3, 'Number of dataset items');
const titles = datasetItems.map((item) => item.title).sort();
await expect(titles.join() === 'expired,self-signed,wrong-host', 'Dataset items validation');
