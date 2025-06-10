import { Dataset } from '../src/storages/dataset';
import { KeyValueStore } from '../src/storages/key_value_store';

it('should export all fields when collectAllKeys is true', async () => {
    const dataset = await Dataset.open();
    await dataset.pushData([
        { id: 1, name: 'Alice' },
        { id: 2, age: 30 },
    ]);

    const kvStore = await KeyValueStore.open();
    await dataset.exportTo('test.csv', {
        toKVS: kvStore.name,
        collectAllKeys: true,
    }, 'text/csv');

    const exported = await kvStore.getValue('test.csv');
    expect(exported).toContain('id');
    expect(exported).toContain('name');
    expect(exported).toContain('age');
});