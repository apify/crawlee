import { Actor, KeyValueStore } from 'apify';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

await Actor.main(async () => {
    const kv = await KeyValueStore.open();
    kv.setValue('storageObject', { storeObject: kv.storageObject });
}, mainOptions);
