import { Actor, Dataset, KeyValueStore } from 'apify';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

await Actor.main(async () => {
    const kv = await KeyValueStore.open();
    const dataset = await Dataset.open();
    await kv.setValue('storageObject', {
        keyValueStorageObject: kv.storageObject,
        datasetStorageObject: dataset.storageObject,
    });
}, mainOptions);
