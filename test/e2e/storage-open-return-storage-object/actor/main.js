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
    // v4 dropped `storageObject`; the metadata is exposed directly on the instances.
    await kv.setValue('storageObject', {
        keyValueStorageObject: { id: kv.id, name: kv.name ?? null },
        datasetStorageObject: { id: dataset.id, name: dataset.name ?? null },
    });
}, mainOptions);
