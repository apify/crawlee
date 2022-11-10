import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MemoryStorage } from '@crawlee/memory-storage';
import type { DatasetClient } from '@crawlee/types';

const elements = Array.from({ length: 10 }, (_, i) => ({ number: i }));

describe('Dataset#listItems respects the desc option', () => {
    const localDataDirectory = resolve(__dirname, './tmp/desc');
    const storage = new MemoryStorage({
        localDataDirectory,
        persistStorage: false,
    });

    let dataset: DatasetClient;

    afterAll(async () => {
        await rm(localDataDirectory, { force: true, recursive: true });
    });

    beforeAll(async () => {
        const { id: falseDatasetId } = await storage.datasets().getOrCreate('false');
        dataset = storage.dataset(falseDatasetId);

        await dataset.pushItems(elements);
    });

    test('with desc: false', async () => {
        const result = await dataset.listItems({ desc: false, limit: 5 });

        expect(result.items).toHaveLength(5);
        expect(result.items).toStrictEqual(elements.slice(0, 5));
    });

    test('with desc: true', async () => {
        const result = await dataset.listItems({ desc: true, limit: 5 });

        expect(result.items).toHaveLength(5);
        expect(result.items).toStrictEqual(elements.slice().reverse().slice(0, 5));
    });

    test('with desc: false and offset: 2', async () => {
        const result = await dataset.listItems({ desc: false, limit: 5, offset: 2 });

        expect(result.items).toHaveLength(5);
        expect(result.items).toStrictEqual(elements.slice(2, 7));
    });

    test('with desc: true and offset: 2', async () => {
        const result = await dataset.listItems({ desc: true, limit: 5, offset: 2 });

        expect(result.items).toHaveLength(5);
        expect(result.items).toStrictEqual(elements.slice().reverse().slice(2, 7));
    });
});
