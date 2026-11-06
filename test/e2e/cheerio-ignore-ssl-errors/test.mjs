import { expect, getActorTestDir, initialize, runActor, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

// ~21 of the 31 URLs load (the rest use ciphers impit can't negotiate); the throw-on-ssl-errors twin gets ~5.
await expect(stats.requestsSucceeded > 15, 'All requests finished');
await expect(datasetItems.length > 15, 'Minimum number of dataset items');
await expect(validateDataset(datasetItems, ['url', 'title']), 'Dataset items validation');
