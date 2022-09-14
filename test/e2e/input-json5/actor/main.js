import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { Actor, Dataset, KeyValueStore } from 'apify';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.setValue('INPUT', readFileSync(join(process.cwd(), 'INPUT')).toString(), {
    contentType: 'application/json',
});

await Actor.main(async () => {
    await Dataset.pushData(await KeyValueStore.getInput());
    await Dataset.pushData(await Actor.getInput());
}, mainOptions);
