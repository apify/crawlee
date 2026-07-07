import { rm } from 'node:fs/promises';
import path from 'node:path';

import { MemoryStorage } from '@crawlee/memory-storage';
import type { DatasetClient } from '@crawlee/types';

describe('Dataset snapshot behavior', () => {
    const localDataDirectory = path.resolve(__dirname, './tmp/dataset-snapshot');
    const storage = new MemoryStorage({
        localDataDirectory,
        persistStorage: false,
    });

    afterAll(async () => {
        await rm(localDataDirectory, { force: true, recursive: true });
    });

    test('pushing the same mutable object multiple times stores independent snapshots', async () => {
        const { id } = await storage.datasets().getOrCreate('snapshot-test');
        const dataset: DatasetClient = storage.dataset(id);

        const data = { rand: 0 };

        data.rand = Math.random();
        await dataset.pushItems({ rand: data.rand });

        data.rand = Math.random();
        await dataset.pushItems({ rand: data.rand });

        data.rand = Math.random();
        await dataset.pushItems({ rand: data.rand });

        const result = await dataset.listItems();

        expect(result.items).toHaveLength(3);

        // All three items should have distinct values, matching what was pushed
        const values = result.items.map((item: any) => item.rand);
        const uniqueValues = new Set(values);
        expect(uniqueValues.size).toBe(3);
    });

    test('pushing the same object reference multiple times with mutations stores independent snapshots', async () => {
        const { id } = await storage.datasets().getOrCreate('snapshot-test-reference');
        const dataset: DatasetClient = storage.dataset(id);

        const mutableData = { rand: 0, counter: 0 };

        mutableData.rand = 0.1;
        mutableData.counter = 1;
        await dataset.pushItems(mutableData);

        mutableData.rand = 0.2;
        mutableData.counter = 2;
        await dataset.pushItems(mutableData);

        mutableData.rand = 0.3;
        mutableData.counter = 3;
        await dataset.pushItems(mutableData);

        const result = await dataset.listItems();

        expect(result.items).toHaveLength(3);
        expect(result.items[0]).toStrictEqual({ rand: 0.1, counter: 1 });
        expect(result.items[1]).toStrictEqual({ rand: 0.2, counter: 2 });
        expect(result.items[2]).toStrictEqual({ rand: 0.3, counter: 3 });
    });
});
