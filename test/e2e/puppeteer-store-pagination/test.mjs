import { expect, getActorTestDir, initialize, runActor, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, 16384);

await expect(stats.requestsFinished >= 10, 'All requests finished');
await expect(datasetItems.length > 5 && datasetItems.length < 15, 'Number of dataset items');
await expect(
    validateDataset(datasetItems, ['manufacturer', 'title', 'sku', 'currentPrice', 'availableInStock']),
    'Dataset items validation',
);
// `url` is checked separately: validateDataset matches it against a regex that
// rejects the fixture's 127.0.0.1 origin.
await expect(
    datasetItems.every((item) => URL.canParse(item.url) && new URL(item.url).pathname.startsWith('/products/')),
    'Dataset items have product URLs',
);
