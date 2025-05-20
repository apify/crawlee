import { expect, getActorTestDir, initialize, runActor } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname, 16384);

const cartRequest = datasetItems.find((item) => item.url === 'https://warehouse-theme-metal.myshopify.com/cart');
const checkoutRequest = datasetItems.find(
    (item) => item.url === 'https://warehouse-theme-metal.myshopify.com/checkout',
);

await expect(!cartRequest, '/cart URL is not processed');
await expect(!checkoutRequest, '/checkout URL is not processed');
