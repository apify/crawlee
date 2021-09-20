import {
    ENV_VARS,
    MAX_PAYLOAD_SIZE_BYTES,
} from '@apify/consts';
import { apifyClient } from '../../build/utils';
import {
    Dataset,
    checkAndSerialize,
    chunkBySize,
} from '../../build/storages/dataset';
import Apify from '../../build';
import { StorageManager } from '../../build/storages/storage_manager';

jest.mock('../../build/storages/storage_manager');

describe('dataset', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
    });

    describe('remote', () => {
        const mockData = (bytes) => 'x'.repeat(bytes);

        test('openDataset should open storage', async () => {
            const datasetName = 'abc';
            const options = { forceCloud: true };
            // This test uses and explains Jest mocking. Under import statements,
            // the StorageManager is immediately mocked. This replaces the class
            // with an observable. We can now call functions that use the class
            // and observe how they interact with StorageManager.
            await Apify.openDataset(datasetName, options);
            // Apify.openRequestQueue creates an instance of StorageManager.
            // Here we check that the constructor was really called once.
            expect(StorageManager).toHaveBeenCalledTimes(1);
            // Jest gives you access to newly created instances of the class.
            // Here we grab the StorageManager instance openRequestQueue created.
            const mockStorageManagerInstance = StorageManager.mock.instances[0];
            // And here we get a reference to the specific instance's function mock.
            const mockOpenStorage = mockStorageManagerInstance.openStorage;
            // Finally, we test that the function was called with expected args.
            expect(mockOpenStorage).toHaveBeenCalledWith(datasetName, options);
            expect(mockOpenStorage).toHaveBeenCalledTimes(1);
        });

        test('should work', async () => {
            const dataset = new Dataset({
                id: 'some-id',
                client: apifyClient,
            });

            const mockPushItems = jest
                .spyOn(dataset.client, 'pushItems')
                .mockResolvedValueOnce(null);

            await dataset.pushData({ foo: 'bar' });

            expect(mockPushItems).toHaveBeenCalledTimes(1);
            expect(mockPushItems).toHaveBeenCalledWith(
                JSON.stringify({ foo: 'bar' }),
            );

            const mockPushItems2 = jest
                .spyOn(dataset.client, 'pushItems')
                .mockResolvedValueOnce(null);

            await dataset.pushData([
                { foo: 'hotel;' },
                { foo: 'restaurant' },
            ]);

            expect(mockPushItems2).toHaveBeenCalledTimes(2);
            expect(mockPushItems2).toHaveBeenCalledWith(
                JSON.stringify([{ foo: 'hotel;' }, { foo: 'restaurant' }]),
            );

            const mockDelete = jest
                .spyOn(dataset.client, 'delete')
                .mockResolvedValueOnce(undefined);

            await dataset.drop();

            expect(mockDelete).toHaveBeenCalledTimes(1);
            expect(mockDelete).toHaveBeenLastCalledWith();
        });

        test('should successfully save large data', async () => {
            const half = mockData(MAX_PAYLOAD_SIZE_BYTES / 2);

            const dataset = new Dataset({
                id: 'some-id',
                client: apifyClient,
            });

            const mockPushItems = jest.spyOn(dataset.client, 'pushItems');
            mockPushItems.mockResolvedValueOnce(null);
            mockPushItems.mockResolvedValueOnce(null);

            await dataset.pushData([
                { foo: half },
                { bar: half },
            ]);

            expect(mockPushItems).toHaveBeenCalledTimes(2);
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
                client: apifyClient,
            });

            const mockPushItems = jest.spyOn(dataset.client, 'pushItems');
            mockPushItems.mockResolvedValueOnce(null);
            mockPushItems.mockResolvedValueOnce(null);

            await dataset.pushData(data);

            expect(mockPushItems).toHaveBeenCalledTimes(2);
            expect(mockPushItems).toHaveBeenNthCalledWith(1, expectedFirst);
            expect(mockPushItems).toHaveBeenNthCalledWith(2, expectedSecond);
        });

        test('should throw on too large file', async () => {
            const full = mockData(MAX_PAYLOAD_SIZE_BYTES);
            const dataset = new Dataset({ id: 'some-id', client: apifyClient });
            try {
                await dataset.pushData({ foo: full });
                throw new Error('Should fail!');
            } catch (err) {
                expect(err).toBeInstanceOf(Error);
                expect(err.message).toMatch('Data item is too large');
            }
        });
        test('should throw on too large file in an array', async () => {
            const full = mockData(MAX_PAYLOAD_SIZE_BYTES);
            const dataset = new Dataset({ id: 'some-id', client: apifyClient });
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
                expect(err.message).toMatch('Data item at index 3 is too large');
            }
        });

        test('getData() should work', async () => {
            const dataset = new Dataset({
                id: 'some-id',
                client: apifyClient,
            });

            const expected = {
                items: [
                    { foo: 'bar' },
                    { foo: 'hotel' },
                ],
                limit: 2,
                total: 1000,
                offset: 3,
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
            expect(e.message).toEqual('dataset.getData(): The response is too large for parsing. You can fix this by lowering the "limit" option.'); // eslint-disable-line max-len
            spy.mockRestore();
        });

        test('getInfo() should work', async () => {
            const dataset = new Dataset({ id: 'some-id', client: apifyClient });

            const expected = {
                id: 'WkzbQMuFYuamGv3YF',
                name: 'd7b9MDYsbtX5L7XAj',
                userId: 'wRsJZtadYvn4mBZmm',
                createdAt: new Date('2015-12-12T07:34:14.202Z'),
                modifiedAt: new Date('2015-12-13T08:36:13.202Z'),
                accessedAt: new Date('2015-12-14T08:36:13.202Z'),
                itemCount: 14,
                cleanItemCount: 10,
            };

            const mockGetDataset = jest.spyOn(dataset.client, 'get');
            mockGetDataset.mockResolvedValueOnce(expected);

            const result = await dataset.getInfo();

            expect(result).toEqual(expected);
        });

        const getRemoteDataset = () => {
            const dataset = new Dataset({
                id: 'some-id',
                client: apifyClient,
            });

            const firstResolve = {
                items: [
                    { foo: 'a' },
                    { foo: 'b' },
                ],
                limit: 2,
                total: 4,
                offset: 0,
            };

            const secondResolve = {
                items: [
                    { foo: 'c' },
                    { foo: 'd' },
                ],
                limit: 2,
                total: 4,
                offset: 2,
            };

            const mockListItems = jest.spyOn(dataset.client, 'listItems');
            mockListItems.mockResolvedValueOnce(firstResolve);
            mockListItems.mockResolvedValueOnce(secondResolve);

            const restoreAndVerify = () => {
                expect(mockListItems).toHaveBeenCalledTimes(2);
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

            const items = [];
            const indexes = [];
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
                client: apifyClient,
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
            });
            mockListItems.mockResolvedValueOnce({
                items: [
                    { foo: 4 },
                    { foo: 1 },
                ],
                limit: 2,
                total: 4,
                offset: 2,
            });

            const calledForIndexes = [];

            const result = await dataset.reduce((memo, item, index) => {
                calledForIndexes.push(index);
                return Promise.resolve(memo.foo > item.foo ? memo : item);
            }, undefined, {
                limit: 2,
            });

            expect(mockListItems).toHaveBeenCalledTimes(2);
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
        test(
            'throws if DEFAULT_DATASET_ID env var is not defined and we use cloud storage',
            async () => {
                delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
                process.env[ENV_VARS.TOKEN] = 'xxx';

                process.env[ENV_VARS.DEFAULT_DATASET_ID] = '';
                await expect(Apify.pushData({ something: 123 })).rejects.toThrow(Error);

                delete process.env[ENV_VARS.DEFAULT_DATASET_ID];
                await expect(Apify.pushData({ something: 123 })).rejects.toThrow(Error);

                delete process.env[ENV_VARS.TOKEN];
            },
        );

        test('throws on invalid args', async () => {
            const dataset = new Dataset({
                id: 'some-id',
                client: apifyClient,
            });
            await expect(dataset.pushData()).rejects.toThrow('Expected argument to be of type `object` but received type `undefined`');
            await expect(dataset.pushData('')).rejects.toThrow('Expected argument to be of type `object` but received type `string`');
            await expect(dataset.pushData(123)).rejects.toThrow('Expected argument to be of type `object` but received type `number`');
            await expect(dataset.pushData(true)).rejects.toThrow('Expected argument to be of type `object` but received type `boolean`');
            await expect(dataset.pushData(false)).rejects.toThrow('Expected argument to be of type `object` but received type `boolean`');
            await expect(dataset.pushData(() => {})).rejects.toThrow('Data item is not an object. You can push only objects into a dataset.');

            const circularObj = {};
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
            const bad = {};
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
