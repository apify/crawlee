import { assertJsonSerializable, chunkBySize, Dataset, KeyValueStore, serviceLocator } from '@crawlee/core';
import type { Dictionary } from '@crawlee/utils';
import { MemoryStorageEmulator } from '../../shared/MemoryStorageEmulator.js';

import { MAX_PAYLOAD_SIZE_BYTES } from '@apify/consts';

const localStorageEmulator = new MemoryStorageEmulator();

beforeEach(async () => {
    await localStorageEmulator.init();
});

afterAll(async () => {
    await localStorageEmulator.destroy();
});

describe('dataset', () => {
    async function createDataset(id = 'some-id', name?: string) {
        const client = await serviceLocator.getStorageClient().createDatasetClient(name ? { name } : { id });
        return new Dataset({ id, name, client });
    }

    beforeEach(async () => {
        vitest.clearAllMocks();
    });

    describe('remote', () => {
        const mockData = (bytes: number) => 'x'.repeat(bytes);

        test('should work', async () => {
            const dataset = await createDataset();

            const pushDataSpy = vitest.spyOn(dataset.client, 'pushData');

            const mockPushData = pushDataSpy.mockResolvedValueOnce(undefined);

            await dataset.pushData({ foo: 'bar' });

            expect(mockPushData).toHaveBeenCalledTimes(1);
            expect(mockPushData).toHaveBeenCalledWith([{ foo: 'bar' }]);

            const mockPushData2 = pushDataSpy.mockResolvedValueOnce(undefined);

            await dataset.pushData([{ foo: 'hotel;' }, { foo: 'restaurant' }]);

            expect(mockPushData2).toHaveBeenCalledTimes(2);
            expect(mockPushData2).toHaveBeenCalledWith([{ foo: 'hotel;' }, { foo: 'restaurant' }]);

            const mockDrop = vitest.spyOn(dataset.client, 'drop').mockResolvedValueOnce(undefined);

            await dataset.drop();

            expect(mockDrop).toHaveBeenCalledTimes(1);
            expect(mockDrop).toHaveBeenLastCalledWith();
        });

        test('should successfully save large data', async () => {
            const half = mockData(MAX_PAYLOAD_SIZE_BYTES / 2);

            const dataset = await createDataset();

            const mockPushData = vitest.spyOn(dataset.client, 'pushData');
            mockPushData.mockResolvedValueOnce(undefined);

            await dataset.pushData([{ foo: half }, { bar: half }]);

            expect(mockPushData).toHaveBeenCalledTimes(1);
            expect(mockPushData).toHaveBeenCalledWith([{ foo: half }, { bar: half }]);
        });

        test('should successfully save lots of small data', async () => {
            const count = 20;
            const string = mockData(MAX_PAYLOAD_SIZE_BYTES / count);
            const chunk = { foo: string, bar: 'baz' };
            const data = Array(count).fill(chunk);

            const dataset = await createDataset();

            const mockPushData = vitest.spyOn(dataset.client, 'pushData');
            mockPushData.mockResolvedValueOnce(undefined);

            await dataset.pushData(data);

            expect(mockPushData).toHaveBeenCalledTimes(1);
            expect(mockPushData).toHaveBeenCalledWith(data);
        });

        test('getData() should work', async () => {
            const dataset = await createDataset();

            const expected = {
                items: [{ foo: 'bar' }, { foo: 'hotel' }],
                limit: 2,
                total: 1000,
                offset: 3,
                count: 2,
                desc: false,
            };

            const mockGetData = vitest.spyOn(dataset.client, 'getData');
            mockGetData.mockResolvedValueOnce(expected);

            const result = await dataset.getData({ limit: 2, offset: 3 });

            expect(mockGetData).toHaveBeenLastCalledWith({
                limit: 2,
                offset: 3,
            });

            expect(result).toEqual(expected);

            vitest.spyOn(dataset.client, 'getData').mockImplementation(() => {
                throw new Error('Cannot create a string longer than 0x3fffffe7 characters');
            });
            await expect(dataset.getData()).rejects.toThrow(
                'dataset.getData(): The response is too large for parsing. You can fix this by lowering the "limit" option.',
            );
        });

        test('getInfo() should work', async () => {
            const dataset = await createDataset();

            const expected: Awaited<ReturnType<Dataset['getInfo']>> = {
                id: 'WkzbQMuFYuamGv3YF',
                name: 'd7b9MDYsbtX5L7XAj',
                createdAt: new Date('2015-12-12T07:34:14.202Z'),
                modifiedAt: new Date('2015-12-13T08:36:13.202Z'),
                accessedAt: new Date('2015-12-14T08:36:13.202Z'),
                itemCount: 14,
            };

            const mockGetDataset = vitest.spyOn(dataset.client, 'getMetadata');
            mockGetDataset.mockResolvedValueOnce(expected);

            const result = await dataset.getInfo();

            expect(result).toEqual(expected);
        });

        const getRemoteDataset = async () => {
            const dataset = await createDataset();

            const firstResolve = {
                items: [{ foo: 'a' }, { foo: 'b' }],
                limit: 2,
                total: 4,
                offset: 0,
                count: 2,
                desc: false,
            };

            const secondResolve = {
                items: [{ foo: 'c' }, { foo: 'd' }],
                limit: 2,
                total: 4,
                offset: 2,
                count: 2,
                desc: false,
            };

            const mockGetData = vitest.spyOn(dataset.client, 'getData');
            mockGetData.mockResolvedValueOnce(firstResolve);
            mockGetData.mockResolvedValueOnce(secondResolve);

            const restoreAndVerify = () => {
                expect(mockGetData).toHaveBeenCalledTimes(2);
                expect(mockGetData).toHaveBeenNthCalledWith(1, {
                    limit: 2,
                    offset: 0,
                });
                expect(mockGetData).toHaveBeenNthCalledWith(2, {
                    limit: 2,
                    offset: 2,
                });
            };

            return { dataset, restoreAndVerify };
        };

        test('forEach() should work', async () => {
            const { dataset, restoreAndVerify } = await getRemoteDataset();

            const items: Dictionary[] = [];
            const indexes: number[] = [];
            const result = await dataset.forEach(
                (item, index) => {
                    items.push(item);
                    indexes.push(index);
                },
                {
                    limit: 2,
                },
            );
            expect(result).toEqual(undefined);
            expect(items).toEqual([{ foo: 'a' }, { foo: 'b' }, { foo: 'c' }, { foo: 'd' }]);
            expect(indexes).toEqual([0, 1, 2, 3]);

            restoreAndVerify();
        });

        test('map() should work', async () => {
            const { dataset, restoreAndVerify } = await getRemoteDataset();

            const result = await dataset.map(
                (item, index) => {
                    return { index, bar: 'xxx', ...item };
                },
                {
                    limit: 2,
                },
            );

            expect(result).toEqual([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);

            restoreAndVerify();
        });

        test('map() should support promises', async () => {
            const { dataset, restoreAndVerify } = await getRemoteDataset();

            const result = await dataset.map(
                async (item, index) => {
                    const res = { index, bar: 'xxx', ...item };
                    return Promise.resolve(res);
                },
                {
                    limit: 2,
                },
            );

            expect(result).toEqual([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);

            restoreAndVerify();
        });

        test('reduce() should work', async () => {
            const { dataset, restoreAndVerify } = await getRemoteDataset();

            const result = await dataset.reduce(
                (memo, item, index) => {
                    item.index = index;
                    item.bar = 'xxx';

                    return memo.concat(item);
                },
                [] as unknown[],
                {
                    limit: 2,
                },
            );

            expect(result).toEqual([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);

            restoreAndVerify();
        });

        test('reduce() should support promises', async () => {
            const { dataset, restoreAndVerify } = await getRemoteDataset();

            const result = await dataset.reduce(
                async (memo, item, index) => {
                    item.index = index;
                    item.bar = 'xxx';

                    return Promise.resolve(memo.concat(item));
                },
                [] as unknown[],
                {
                    limit: 2,
                },
            );

            expect(result).toEqual([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);

            restoreAndVerify();
        });

        test('reduce() uses first value as memo if no memo is provided', async () => {
            const dataset = await createDataset('some-id', 'some-name');
            const mockGetData = vitest.spyOn(dataset.client, 'getData');
            mockGetData.mockResolvedValueOnce({
                items: [{ foo: 4 }, { foo: 5 }],
                limit: 2,
                total: 4,
                offset: 0,
                count: 2,
                desc: false,
            });
            mockGetData.mockResolvedValueOnce({
                items: [{ foo: 4 }, { foo: 1 }],
                limit: 2,
                total: 4,
                offset: 2,
                count: 2,
                desc: true,
            });

            const calledForIndexes: number[] = [];

            const result = await dataset.reduce(
                async (memo, item, index) => {
                    calledForIndexes.push(index);
                    return Promise.resolve(memo.foo > item.foo ? memo : item);
                },
                undefined,
                {
                    limit: 2,
                },
            );

            expect(mockGetData).toHaveBeenCalledTimes(2);
            expect(mockGetData).toHaveBeenNthCalledWith(1, {
                limit: 2,
                offset: 0,
            });
            expect(mockGetData).toHaveBeenNthCalledWith(2, {
                limit: 2,
                offset: 2,
            });

            expect(result!.foo).toBe(5);
            expect(calledForIndexes).toEqual([1, 2, 3]);
        });
    });

    describe('pushData', () => {
        test('throws on invalid args', async () => {
            const dataset = await createDataset();
            // @ts-expect-error JS-side validation
            await expect(dataset.pushData()).rejects.toThrow(
                'Expected `data` to be of type `object` but received type `undefined`',
            );
            // @ts-expect-error JS-side validation
            await expect(dataset.pushData('')).rejects.toThrow(
                'Expected `data` to be of type `object` but received type `string`',
            );
            // @ts-expect-error JS-side validation
            await expect(dataset.pushData(123)).rejects.toThrow(
                'Expected `data` to be of type `object` but received type `number`',
            );
            // @ts-expect-error JS-side validation
            await expect(dataset.pushData(true)).rejects.toThrow(
                'Expected `data` to be of type `object` but received type `boolean`',
            );
            // @ts-expect-error JS-side validation
            await expect(dataset.pushData(false)).rejects.toThrow(
                'Expected `data` to be of type `object` but received type `boolean`',
            );
            await expect(dataset.pushData(() => {})).rejects.toThrow(
                'Data item at index 0 is not an object. You can push only objects into a dataset.',
            );

            const circularObj = {} as Dictionary;
            circularObj.xxx = circularObj;
            const jsonErrMsg = 'Converting circular structure to JSON';
            await expect(dataset.pushData(circularObj)).rejects.toThrow(jsonErrMsg);
        });
    });

    describe('utils', () => {
        test('assertJsonSerializable() works', () => {
            // Valid objects
            expect(() => assertJsonSerializable({})).not.toThrow();
            expect(() => assertJsonSerializable({ foo: 'bar' })).not.toThrow();
            expect(() => assertJsonSerializable({ foo: 'bar' }, 1)).not.toThrow();
            // Circular reference
            const bad = {} as Dictionary;
            bad.bad = bad;
            expect(() => assertJsonSerializable(bad)).toThrow('not serializable to JSON');
            // Non-objects
            expect(() => assertJsonSerializable('hello')).toThrow('not an object');
            expect(() => assertJsonSerializable([])).toThrow('not an object');
            expect(() => assertJsonSerializable(['a', 'b'])).toThrow('not an object');
            // With index in error message
            expect(() => assertJsonSerializable('hello', 3)).toThrow('at index 3');
        });
        test('chunkBySize', () => {
            const obj = { foo: 'bar' };
            const json = JSON.stringify(obj);
            const size = Buffer.byteLength(json);
            const triple = [json, json, json];
            const originalTriple = [obj, obj, obj];
            const chunk = `[${json}]`;
            const tripleChunk = `[${json},${json},${json}]`;
            const tripleSize = Buffer.byteLength(tripleChunk);
            // Empty array
            expect(chunkBySize([], 10)).toEqual([]);
            // Fits easily
            expect(chunkBySize([json], size + 10)).toEqual([json]);
            expect(chunkBySize(triple, tripleSize + 10)).toEqual([tripleChunk]);
            // Parses back to original objects
            expect(originalTriple).toEqual(JSON.parse(tripleChunk));
            // Fits exactly
            expect(chunkBySize([json], size)).toEqual([json]);
            expect(chunkBySize(triple, tripleSize)).toEqual([tripleChunk]);
            // Chunks large items individually
            expect(chunkBySize(triple, size)).toEqual(triple);
            expect(chunkBySize(triple, size + 1)).toEqual(triple);
            expect(chunkBySize(triple, size + 2)).toEqual([chunk, chunk, chunk]);
            // Chunks smaller items together
            expect(chunkBySize(triple, 2 * size + 3)).toEqual([`[${json},${json}]`, chunk]);
            expect(chunkBySize([...triple, ...triple], 2 * size + 3)).toEqual([
                `[${json},${json}]`,
                `[${json},${json}]`,
                `[${json},${json}]`,
            ]);
        });

        describe('exportToJSON', () => {
            const dataToPush = [
                {
                    hello: 'world 1',
                    foo: 'bar 1',
                },
                {
                    foo: 'bar 2',
                    hello: 'world 2',
                },
                {
                    hello: 'world 3',
                    foo: 'bar 3',
                },
            ];

            it('Should work', async () => {
                const dataset = await Dataset.open({ name: Math.random().toString(36) });
                await dataset.pushData(dataToPush);
                await dataset.exportToJSON('HELLO');

                const kvData = await KeyValueStore.getValue('HELLO');
                expect(kvData).toEqual(dataToPush);
            });

            it('Should work as a static method for the default dataset', async () => {
                await Dataset.pushData(dataToPush);
                await Dataset.exportToJSON('TEST-123-123');

                const kvData = await KeyValueStore.getValue('TEST-123-123');
                expect(kvData).toEqual(dataToPush);
            });
        });

        describe('exportToCSV', () => {
            const dataToPush = [
                {
                    hello: 'world 1',
                    foo: 'bar 1',
                },
                {
                    foo: 'bar 2',
                    hello: 'world 2',
                },
                {
                    hello: 'world 3',
                    foo: 'bar 3',
                },
            ];

            it('Should work', async () => {
                const dataset = await Dataset.open({ name: Math.random().toString(36) });
                await dataset.pushData(dataToPush);
                await dataset.exportToCSV('HELLO-csv');

                const kvData = await KeyValueStore.getValue('HELLO-csv');
                expect(kvData).toEqual('hello,foo\nworld 1,bar 1\nworld 2,bar 2\nworld 3,bar 3\n');
            });

            it('Should work as a static method for the default dataset', async () => {
                await Dataset.pushData(dataToPush);
                await Dataset.exportToCSV('TEST-123-123-csv');

                const kvData = await KeyValueStore.getValue('TEST-123-123-csv');
                expect(kvData).toEqual('hello,foo\nworld 1,bar 1\nworld 2,bar 2\nworld 3,bar 3\n');
            });
            it('should export all fields when collectAllKeys is true', async () => {
                const dataset = await Dataset.open();
                await dataset.pushData([
                    { id: 1, name: 'Alice' },
                    { id: 2, age: 30 },
                ]);

                const kvStore = await KeyValueStore.open();
                await dataset.exportTo(
                    'test.csv',
                    {
                        toKVS: { name: kvStore.name! },
                        collectAllKeys: true,
                    },
                    'text/csv',
                );

                const exported = await kvStore.getValue('test.csv');
                expect(exported).toContain('id');
                expect(exported).toContain('name');
                expect(exported).toContain('age');
            });
        });

        describe('async iterators', () => {
            const testData = [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' },
                { id: 3, name: 'Charlie' },
            ];

            test('values() should iterate over all items', async () => {
                const dataset = await Dataset.open();
                await dataset.pushData(testData);

                const items = [];
                for await (const item of dataset.values()) {
                    items.push(item);
                }

                expect(items).toEqual(testData);
            });

            test('values() respects limit when iterating', async () => {
                const dataset = await Dataset.open();
                await dataset.pushData(testData);

                const items = [];
                for await (const item of dataset.values({ limit: 2 })) {
                    items.push(item);
                }

                expect(items).toHaveLength(2);
                expect(items).toEqual(testData.slice(0, 2));
            });

            test('values() respects offset when iterating', async () => {
                const dataset = await Dataset.open();
                await dataset.pushData(testData);

                const items = [];
                for await (const item of dataset.values({ offset: 1 })) {
                    items.push(item);
                }

                expect(items).toHaveLength(2);
                expect(items).toEqual(testData.slice(1));
            });

            test('entries() should iterate over index-item pairs', async () => {
                const dataset = await Dataset.open();
                await dataset.pushData(testData);

                const entries = [];
                for await (const [index, item] of dataset.entries()) {
                    entries.push([index, item]);
                }

                expect(entries).toEqual([
                    [0, { id: 1, name: 'Alice' }],
                    [1, { id: 2, name: 'Bob' }],
                    [2, { id: 3, name: 'Charlie' }],
                ]);
            });

            test('entries() should respect offset option', async () => {
                const dataset = await Dataset.open();
                await dataset.pushData(testData);

                const entries = [];
                for await (const [index, item] of dataset.entries({ offset: 1 })) {
                    entries.push([index, item]);
                }

                expect(entries).toEqual([
                    [1, { id: 2, name: 'Bob' }],
                    [2, { id: 3, name: 'Charlie' }],
                ]);
            });

            test('entries() respects limit when iterating', async () => {
                const dataset = await Dataset.open();
                await dataset.pushData(testData);

                const entries = [];
                for await (const entry of dataset.entries({ limit: 2 })) {
                    entries.push(entry);
                }

                expect(entries).toHaveLength(2);
                expect(entries).toEqual([
                    [0, { id: 1, name: 'Alice' }],
                    [1, { id: 2, name: 'Bob' }],
                ]);
            });

            test('entries() respects offset when iterating', async () => {
                const dataset = await Dataset.open();
                await dataset.pushData(testData);

                const entries = [];
                for await (const entry of dataset.entries({ offset: 1 })) {
                    entries.push(entry);
                }

                expect(entries).toHaveLength(2);
                expect(entries).toEqual([
                    [1, { id: 2, name: 'Bob' }],
                    [2, { id: 3, name: 'Charlie' }],
                ]);
            });

            test('Symbol.asyncIterator should iterate over items', async () => {
                const dataset = await Dataset.open();
                await dataset.pushData(testData);

                const items = [];
                for await (const item of dataset) {
                    items.push(item);
                }

                expect(items).toEqual(testData);
            });

            test('should work with empty dataset', async () => {
                const dataset = await Dataset.open();

                const items: unknown[] = [];
                for await (const item of dataset.values()) {
                    items.push(item);
                }

                expect(items).toEqual([]);
            });
        });
    });
});
