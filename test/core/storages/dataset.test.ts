import { MAX_PAYLOAD_SIZE_BYTES } from '@apify/consts';
import { Dataset, checkAndSerialize, chunkBySize, Configuration } from '@crawlee/core';
import type { Dictionary } from '@crawlee/utils';

describe('dataset', () => {
    const storageClient = Configuration.getStorageClient();

    beforeEach(async () => {
        jest.clearAllMocks();
    });

    describe('remote', () => {
        const mockData = (bytes: number) => 'x'.repeat(bytes);

        test('should work', async () => {
            const dataset = new Dataset({
                id: 'some-id',
                client: storageClient,
            });

            const mockPushItems = jest
                .spyOn(dataset.client, 'pushItems')
                .mockResolvedValueOnce(null);

            await dataset.pushData({ foo: 'bar' });

            expect(mockPushItems).toBeCalledTimes(1);
            expect(mockPushItems).toBeCalledWith(
                JSON.stringify({ foo: 'bar' }),
            );

            const mockPushItems2 = jest
                .spyOn(dataset.client, 'pushItems')
                .mockResolvedValueOnce(null);

            await dataset.pushData([
                { foo: 'hotel;' },
                { foo: 'restaurant' },
            ]);

            expect(mockPushItems2).toBeCalledTimes(2);
            expect(mockPushItems2).toBeCalledWith(
                JSON.stringify([{ foo: 'hotel;' }, { foo: 'restaurant' }]),
            );

            const mockDelete = jest
                .spyOn(dataset.client, 'delete')
                .mockResolvedValueOnce(undefined);

            await dataset.drop();

            expect(mockDelete).toBeCalledTimes(1);
            expect(mockDelete).toHaveBeenLastCalledWith();
        });

        test('should successfully save large data', async () => {
            const half = mockData(MAX_PAYLOAD_SIZE_BYTES / 2);

            const dataset = new Dataset({
                id: 'some-id',
                client: storageClient,
            });

            const mockPushItems = jest.spyOn(dataset.client, 'pushItems');
            mockPushItems.mockResolvedValueOnce(null);
            mockPushItems.mockResolvedValueOnce(null);

            await dataset.pushData([
                { foo: half },
                { bar: half },
            ]);

            expect(mockPushItems).toBeCalledTimes(2);
            expect(mockPushItems).toHaveBeenNthCalledWith(1, JSON.stringify([{ foo: half }]));
            expect(mockPushItems).toHaveBeenNthCalledWith(2, JSON.stringify([{ bar: half }]));
        });

        test('should successfully save lots of small data', async () => {
            const count = 20;
            const string = mockData(MAX_PAYLOAD_SIZE_BYTES / count);
            const chunk = { foo: string, bar: 'baz' };
            const data = Array(count).fill(chunk);
            const expectedFirst = JSON.stringify(Array(count - 1).fill(chunk));
            const expectedSecond = JSON.stringify([chunk]);

            const dataset = new Dataset({
                id: 'some-id',
                client: storageClient,
            });

            const mockPushItems = jest.spyOn(dataset.client, 'pushItems');
            mockPushItems.mockResolvedValueOnce(null);
            mockPushItems.mockResolvedValueOnce(null);

            await dataset.pushData(data);

            expect(mockPushItems).toBeCalledTimes(2);
            expect(mockPushItems).toHaveBeenNthCalledWith(1, expectedFirst);
            expect(mockPushItems).toHaveBeenNthCalledWith(2, expectedSecond);
        });

        test('should throw on too large file', async () => {
            const full = mockData(MAX_PAYLOAD_SIZE_BYTES);
            const dataset = new Dataset({ id: 'some-id', client: storageClient });
            try {
                await dataset.pushData({ foo: full });
                throw new Error('Should fail!');
            } catch (err) {
                expect(err).toBeInstanceOf(Error);
                expect((err as Error).message).toMatch('Data item is too large');
            }
        });
        test('should throw on too large file in an array', async () => {
            const full = mockData(MAX_PAYLOAD_SIZE_BYTES);
            const dataset = new Dataset({ id: 'some-id', client: storageClient });
            try {
                await dataset.pushData([
                    { foo: 0 },
                    { foo: 1 },
                    { foo: 2 },
                    { foo: full },
                    { foo: 4 },
                ]);
                throw new Error('Should fail!');
            } catch (err) {
                expect(err).toBeInstanceOf(Error);
                expect((err as Error).message).toMatch('Data item at index 3 is too large');
            }
        });

        test('getData() should work', async () => {
            const dataset = new Dataset({
                id: 'some-id',
                client: storageClient,
            });

            const expected = {
                items: [
                    { foo: 'bar' },
                    { foo: 'hotel' },
                ],
                limit: 2,
                total: 1000,
                offset: 3,
                count: 2,
                desc: false,
            };

            const mockListItems = jest.spyOn(dataset.client, 'listItems');
            mockListItems.mockResolvedValueOnce(expected);

            const result = await dataset.getData({ limit: 2, offset: 3 });

            expect(mockListItems).toHaveBeenLastCalledWith({
                limit: 2,
                offset: 3,
            });

            expect(result).toEqual(expected);
            let e;
            const spy = jest.spyOn(dataset.client, 'listItems')
                .mockImplementation(() => { throw new Error('Cannot create a string longer than 0x3fffffe7 characters'); });
            try {
                await dataset.getData();
            } catch (err) {
                e = err;
            }
            expect((e as Error).message).toEqual('dataset.getData(): The response is too large for parsing. You can fix this by lowering the "limit" option.');
            spy.mockRestore();
        });

        test('getInfo() should work', async () => {
            const dataset = new Dataset({ id: 'some-id', client: storageClient });

            const expected: Awaited<ReturnType<Dataset['getInfo']>> = {
                id: 'WkzbQMuFYuamGv3YF',
                name: 'd7b9MDYsbtX5L7XAj',
                createdAt: new Date('2015-12-12T07:34:14.202Z'),
                modifiedAt: new Date('2015-12-13T08:36:13.202Z'),
                accessedAt: new Date('2015-12-14T08:36:13.202Z'),
                itemCount: 14,
            };

            const mockGetDataset = jest.spyOn(dataset.client, 'get');
            mockGetDataset.mockResolvedValueOnce(expected);

            const result = await dataset.getInfo();

            expect(result).toEqual(expected);
        });

        const getRemoteDataset = () => {
            const dataset = new Dataset({
                id: 'some-id',
                client: storageClient,
            });

            const firstResolve = {
                items: [
                    { foo: 'a' },
                    { foo: 'b' },
                ],
                limit: 2,
                total: 4,
                offset: 0,
                count: 2,
                desc: false,
            };

            const secondResolve = {
                items: [
                    { foo: 'c' },
                    { foo: 'd' },
                ],
                limit: 2,
                total: 4,
                offset: 2,
                count: 2,
                desc: false,
            };

            const mockListItems = jest.spyOn(dataset.client, 'listItems');
            mockListItems.mockResolvedValueOnce(firstResolve);
            mockListItems.mockResolvedValueOnce(secondResolve);

            const restoreAndVerify = () => {
                expect(mockListItems).toBeCalledTimes(2);
                expect(mockListItems).toHaveBeenNthCalledWith(1, {
                    limit: 2,
                    offset: 0,
                });
                expect(mockListItems).toHaveBeenNthCalledWith(2, {
                    limit: 2,
                    offset: 2,
                });
            };

            return { dataset, restoreAndVerify };
        };

        test('forEach() should work', async () => {
            const { dataset, restoreAndVerify } = getRemoteDataset();

            const items: Dictionary[] = [];
            const indexes: number[] = [];
            const result = await dataset.forEach((item, index) => {
                items.push(item);
                indexes.push(index);
            }, {
                limit: 2,
            });
            expect(result).toEqual(undefined);
            expect(items).toEqual([
                { foo: 'a' },
                { foo: 'b' },
                { foo: 'c' },
                { foo: 'd' },
            ]);
            expect(indexes).toEqual([0, 1, 2, 3]);

            restoreAndVerify();
        });

        test('map() should work', async () => {
            const { dataset, restoreAndVerify } = getRemoteDataset();

            const result = await dataset.map((item, index) => {
                return { index, bar: 'xxx', ...item };
            }, {
                limit: 2,
            });

            expect(result).toEqual([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);

            restoreAndVerify();
        });

        test('map() should support promises', async () => {
            const { dataset, restoreAndVerify } = getRemoteDataset();

            const result = await dataset.map((item, index) => {
                const res = { index, bar: 'xxx', ...item };
                return Promise.resolve(res);
            }, {
                limit: 2,
            });

            expect(result).toEqual([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);

            restoreAndVerify();
        });

        test('reduce() should work', async () => {
            const { dataset, restoreAndVerify } = getRemoteDataset();

            const result = await dataset.reduce((memo, item, index) => {
                item.index = index;
                item.bar = 'xxx';

                return memo.concat(item);
            }, [], {
                limit: 2,
            });

            expect(result).toEqual([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);

            restoreAndVerify();
        });

        test('reduce() should support promises', async () => {
            const { dataset, restoreAndVerify } = getRemoteDataset();

            const result = await dataset.reduce((memo, item, index) => {
                item.index = index;
                item.bar = 'xxx';

                return Promise.resolve(memo.concat(item));
            }, [], {
                limit: 2,
            });

            expect(result).toEqual([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);

            restoreAndVerify();
        });

        test('reduce() uses first value as memo if no memo is provided', async () => {
            const dataset = new Dataset({
                id: 'some-id',
                name: 'some-name',
                client: storageClient,
            });
            const mockListItems = jest.spyOn(dataset.client, 'listItems');
            mockListItems.mockResolvedValueOnce({
                items: [
                    { foo: 4 },
                    { foo: 5 },
                ],
                limit: 2,
                total: 4,
                offset: 0,
                count: 2,
                desc: false,
            });
            mockListItems.mockResolvedValueOnce({
                items: [
                    { foo: 4 },
                    { foo: 1 },
                ],
                limit: 2,
                total: 4,
                offset: 2,
                count: 2,
                desc: true,
            });

            const calledForIndexes: number[] = [];

            const result = await dataset.reduce((memo, item, index) => {
                calledForIndexes.push(index);
                return Promise.resolve(memo.foo > item.foo ? memo : item);
            }, undefined, {
                limit: 2,
            });

            expect(mockListItems).toBeCalledTimes(2);
            expect(mockListItems).toHaveBeenNthCalledWith(1, {
                limit: 2,
                offset: 0,
            });
            expect(mockListItems).toHaveBeenNthCalledWith(2, {
                limit: 2,
                offset: 2,
            });

            expect(result.foo).toBe(5);
            expect(calledForIndexes).toEqual([1, 2, 3]);
        });
    });

    describe('pushData', () => {
        test('throws on invalid args', async () => {
            const dataset = new Dataset({
                id: 'some-id',
                client: storageClient,
            });
            // @ts-expect-error JS-side validation
            await expect(dataset.pushData()).rejects.toThrow('Expected `data` to be of type `object` but received type `undefined`');
            // @ts-expect-error JS-side validation
            await expect(dataset.pushData('')).rejects.toThrow('Expected `data` to be of type `object` but received type `string`');
            // @ts-expect-error JS-side validation
            await expect(dataset.pushData(123)).rejects.toThrow('Expected `data` to be of type `object` but received type `number`');
            // @ts-expect-error JS-side validation
            await expect(dataset.pushData(true)).rejects.toThrow('Expected `data` to be of type `object` but received type `boolean`');
            // @ts-expect-error JS-side validation
            await expect(dataset.pushData(false)).rejects.toThrow('Expected `data` to be of type `object` but received type `boolean`');
            await expect(dataset.pushData(() => {})).rejects.toThrow('Data item is not an object. You can push only objects into a dataset.');

            const circularObj = {} as Dictionary;
            circularObj.xxx = circularObj;
            const jsonErrMsg = 'Converting circular structure to JSON';
            await expect(dataset.pushData(circularObj)).rejects.toThrow(jsonErrMsg);
        });
    });

    describe('utils', () => {
        test('checkAndSerialize() works', () => {
            // Basic
            const obj = { foo: 'bar' };
            const json = JSON.stringify(obj);
            expect(checkAndSerialize({}, 100)).toBe('{}');
            expect(checkAndSerialize(obj, 100)).toEqual(json);
            // With index
            expect(checkAndSerialize(obj, 100, 1)).toEqual(json);
            // Too large
            expect(() => checkAndSerialize(obj, 5)).toThrowError(Error);
            expect(() => checkAndSerialize(obj, 5, 7)).toThrowError(Error);
            // Bad JSON
            const bad = {} as Dictionary;
            bad.bad = bad;
            expect(() => checkAndSerialize(bad, 100)).toThrowError(Error);
            // Bad data
            const str = 'hello';
            expect(() => checkAndSerialize(str, 100)).toThrowError(Error);
            expect(() => checkAndSerialize([], 100)).toThrowError(Error);
            expect(() => checkAndSerialize([str, str], 100)).toThrowError(Error);
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
            expect(chunkBySize(triple, (2 * size) + 3)).toEqual([`[${json},${json}]`, chunk]);
            expect(chunkBySize([...triple, ...triple], (2 * size) + 3)).toEqual([`[${json},${json}]`, `[${json},${json}]`, `[${json},${json}]`]);
        });
    });
});
