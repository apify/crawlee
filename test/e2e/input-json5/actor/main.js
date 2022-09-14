import { Actor, Dataset, KeyValueStore } from 'apify';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    await Dataset.pushData(await KeyValueStore.getInput());
}, mainOptions);
