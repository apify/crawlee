import { Actor, Dataset, KeyValueStore } from 'apify';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const a = await KeyValueStore.getInput();
    const b = await Actor.getInput();

    console.log(a);
    console.log(b);

    await Dataset.pushData(a);
    await Dataset.pushData(b);
}, mainOptions);
