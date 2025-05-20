import { expect, getActorTestDir, initialize, runActor } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, 16384);

await expect(stats.requestsFinished >= 1, 'All requests finished');

const cartRequest = datasetItems.find((item) => item.url === 'https://warehouse-theme-metal.myshopify.com/cart');
const checkoutRequest = datasetItems.find(
    (item) => item.url === 'https://warehouse-theme-metal.myshopify.com/checkout',
);

await expect(!cartRequest, '/cart URL is not processed');
await expect(!checkoutRequest, '/checkout URL is not processed');
