import { initialize, getActorTestDir, runActor, expect, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, 16384);

// Of badssl.com's ~31 "bad" links, ~10 use ciphers/protocols modern Chrome removed
// (3des, rc4, dh*, null, …) and can never load regardless of acceptInsecureCerts, so the
// ceiling is ~20. Assert a comfortable floor that still proves cert errors are bypassed.
await expect(stats.requestsFinished > 10, 'All requests finished');
await expect(datasetItems.length > 10, 'Minimum number of dataset items');
await expect(validateDataset(datasetItems, ['url', 'title']), 'Dataset items validation');
