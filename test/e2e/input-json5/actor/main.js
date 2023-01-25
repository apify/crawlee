import { Actor, Dataset, KeyValueStore, log } from 'apify';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const a = await KeyValueStore.getInput();

    log.info('val', a);

    await Dataset.pushData(a);
}, mainOptions);
