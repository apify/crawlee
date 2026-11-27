import { expect, getActorTestDir, initialize, runActor } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

await expect(stats.requestsSucceeded === 1, 'Request to the valid URL finished');
await expect(stats.requestsFailed === 3, 'Requests to the invalid certificates failed');
await expect(datasetItems.length === 1, 'Number of dataset items');
const titles = datasetItems.map((item) => item.title).sort();
await expect(titles.join() === 'valid', 'Dataset items validation');
