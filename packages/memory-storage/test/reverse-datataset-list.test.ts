import { MemoryStorageClient } from '@crawlee/memory-storage';
import type { DatasetClient } from '@crawlee/types';

const elements = Array.from({ length: 10 }, (_, i) => ({ number: i }));

describe('Dataset#getData respects the desc option', () => {
    const storage = new MemoryStorageClient();

    let dataset: DatasetClient;

    beforeAll(async () => {
        dataset = await storage.createDatasetClient({ name: 'false' });

        await dataset.pushData(elements);
    });

    test('with desc: false', async () => {
        const result = await dataset.getData({ desc: false, limit: 5 });

        expect(result.items).toHaveLength(5);
        expect(result.items).toStrictEqual(elements.slice(0, 5));
    });

    test('with desc: true', async () => {
        const result = await dataset.getData({ desc: true, limit: 5 });

        expect(result.items).toHaveLength(5);
        expect(result.items).toStrictEqual(elements.slice().reverse().slice(0, 5));
    });

    test('with desc: false and offset: 2', async () => {
        const result = await dataset.getData({ desc: false, limit: 5, offset: 2 });

        expect(result.items).toHaveLength(5);
        expect(result.items).toStrictEqual(elements.slice(2, 7));
    });

    test('with desc: true and offset: 2', async () => {
        const result = await dataset.getData({ desc: true, limit: 5, offset: 2 });

        expect(result.items).toHaveLength(5);
        expect(result.items).toStrictEqual(elements.slice().reverse().slice(2, 7));
    });
});
