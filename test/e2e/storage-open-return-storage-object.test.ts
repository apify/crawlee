import { harness, scenario } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { Actor, Dataset, KeyValueStore } = await import('apify');

    const mainOptions = { exit: Actor.isAtHome() };

    await Actor.main(async () => {
        const kv = await KeyValueStore.open();
        const dataset = await Dataset.open();
        await kv.setValue('storageObject', {
            keyValueStorageObject: { id: kv.id, name: kv.name ?? null },
            datasetStorageObject: { id: dataset.id, name: dataset.name ?? null },
        });
    }, mainOptions);
};

test('storage-open-return-storage-object', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('storage-open-return-storage-object', {
        source: scenario(import.meta.filename, main),
        memory: 4096,
    });
    const result = await runActor(actor);

    expect(result.status).toBe('SUCCEEDED');
    const record = await result.getKeyValueStoreClient().getRecord('storageObject');
    const { datasetStorageObject, keyValueStorageObject } = record!.value as Record<
        string,
        { id: unknown; name: unknown }
    >;
    expect(datasetStorageObject.id).not.toBeNull();
    expect([null, 'default']).toContain(datasetStorageObject.name);
    expect(keyValueStorageObject.id).not.toBeNull();
    expect([null, 'default']).toContain(keyValueStorageObject.name);
});
