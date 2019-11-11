import fs from 'fs-extra';
import path from 'path';
import sinon from 'sinon';
import { leftpad } from 'apify-shared/utilities';
import { ENV_VARS, MAX_PAYLOAD_SIZE_BYTES } from 'apify-shared/consts';
import { LOCAL_FILENAME_DIGITS, Dataset, DatasetLocal, LOCAL_STORAGE_SUBDIR,
    LOCAL_GET_ITEMS_DEFAULT_LIMIT, checkAndSerialize, chunkBySize } from '../build/dataset';
import * as utils from '../build/utils';
import * as Apify from '../build/index';
import { LOCAL_STORAGE_DIR, emptyLocalStorageSubdir, expectDirEmpty, expectDirNonEmpty } from './_helper';

const { apifyClient } = utils;

const read = (datasetName, index) => {
    const fileName = `${leftpad(index, LOCAL_FILENAME_DIGITS, 0)}.json`;
    const filePath = path.join(LOCAL_STORAGE_DIR, LOCAL_STORAGE_SUBDIR, datasetName, fileName);
    const str = fs.readFileSync(path.resolve(filePath));

    return JSON.parse(str);
};

describe('dataset', () => {
    beforeAll(() => apifyClient.setOptions({ token: 'xxx' }));
    afterAll(() => apifyClient.setOptions({ token: undefined }));
    beforeEach(() => emptyLocalStorageSubdir(LOCAL_STORAGE_SUBDIR));
    afterEach(() => emptyLocalStorageSubdir(LOCAL_STORAGE_SUBDIR));

    describe('local', () => {
        test('should successfully save data', async () => {
            const dataset = new DatasetLocal('my-dataset', LOCAL_STORAGE_DIR);

            await dataset.pushData({ foo: 'bar' });
            await dataset.pushData({ foo: 'hotel' });
            await dataset.pushData([
                { foo: 'from-array-1', arr: [1, 2, 3] },
                { foo: 'from-array-1', arr: [1, 2, 3] },
            ]);

            expect(read('my-dataset', 1)).toEqual({ foo: 'bar' });
            expect(read('my-dataset', 2)).toEqual({ foo: 'hotel' });
            expect(read('my-dataset', 3)).toEqual({ foo: 'from-array-1', arr: [1, 2, 3] });
            expect(read('my-dataset', 4)).toEqual({ foo: 'from-array-1', arr: [1, 2, 3] });

            // Correctly initializes the state.
            const newDataset = new DatasetLocal('my-dataset', LOCAL_STORAGE_DIR);
            await newDataset.pushData({ foo2: 'bar2' });
            expect(read('my-dataset', 5)).toEqual({ foo2: 'bar2' });

            // Drop works.
            const datasetDir = path.join(LOCAL_STORAGE_DIR, LOCAL_STORAGE_SUBDIR, 'my-dataset');
            expectDirNonEmpty(datasetDir);
            await newDataset.drop();
            expectDirEmpty(datasetDir);
        });

        const getLocalDataset = async (data) => {
            const dataset = new DatasetLocal('my-dataset', LOCAL_STORAGE_DIR);
            await dataset.pushData(data);

            return dataset;
        };

        test('getData() should work', async () => {
            const dataset = await getLocalDataset([
                { foo: 'a' },
                { foo: 'b' },
                { foo: 'c' },
                { foo: 'd' },
            ]);

            expect(await dataset.getData()).toEqual({
                items: [
                    { foo: 'a' },
                    { foo: 'b' },
                    { foo: 'c' },
                    { foo: 'd' },
                ],
                total: 4,
                offset: 0,
                count: 4,
                limit: LOCAL_GET_ITEMS_DEFAULT_LIMIT,
            });

            expect(await dataset.getData({ offset: 2 })).toEqual({
                items: [
                    { foo: 'c' },
                    { foo: 'd' },
                ],
                total: 4,
                offset: 2,
                count: 2,
                limit: LOCAL_GET_ITEMS_DEFAULT_LIMIT,
            });

            expect(await dataset.getData({ offset: 1, limit: 2 })).toEqual({
                items: [
                    { foo: 'b' },
                    { foo: 'c' },
                ],
                total: 4,
                offset: 1,
                count: 2,
                limit: 2,
            });

            expect(await dataset.getData({ offset: 10 })).toEqual({
                items: [],
                total: 4,
                offset: 10,
                count: 0,
                limit: LOCAL_GET_ITEMS_DEFAULT_LIMIT,
            });
        });

        test('getInfo() should work', async () => {
            const datasetName = 'stats-dataset';
            const dataset = new DatasetLocal(datasetName, LOCAL_STORAGE_DIR);
            await Apify.utils.sleep(2);

            // Save orig env var since it persists over tests.
            const originalUserId = process.env[ENV_VARS.USER_ID];
            // Try empty ID
            delete process.env[ENV_VARS.USER_ID];

            let info = await dataset.getInfo();
            expect(info).toBeInstanceOf(Object);
            expect(info.id).toEqual(datasetName);
            expect(info.name).toEqual(datasetName);
            expect(info.userId).toBe(null);
            expect(info.itemCount).toBe(0);
            expect(info.cleanItemCount).toBe(0);
            const cTime = info.createdAt.getTime();
            let mTime = info.modifiedAt.getTime();
            expect(cTime).toBeLessThan(Date.now() + 1);
            expect(cTime).toEqual(mTime);

            await dataset.pushData([
                { foo: 'a' },
                { foo: 'b' },
                { foo: 'c' },
                { foo: 'd' },
            ]);
            await Apify.utils.sleep(2);

            info = await dataset.getInfo();
            expect(info).toBeInstanceOf(Object);
            expect(info.id).toEqual(datasetName);
            expect(info.name).toEqual(datasetName);
            expect(info.userId).toBe(null);
            expect(info.itemCount).toBe(4);
            expect(info.cleanItemCount).toBe(4);
            mTime = info.modifiedAt.getTime();
            let aTime = info.accessedAt.getTime();
            expect(cTime).toBeLessThan(Date.now());
            expect(cTime).toBeLessThan(mTime);
            expect(mTime).toEqual(aTime);

            await dataset.getData();
            await Apify.utils.sleep(2);
            const now = Date.now();
            await Apify.utils.sleep(2);

            // Try setting an ID
            const userId = 'some_ID';
            process.env[ENV_VARS.USER_ID] = userId;

            info = await dataset.getInfo();
            expect(info).toBeInstanceOf(Object);
            expect(info.id).toEqual(datasetName);
            expect(info.name).toEqual(datasetName);
            expect(info.userId).toEqual(userId);
            expect(info.itemCount).toBe(4);
            expect(info.cleanItemCount).toBe(4);
            const cTime2 = info.createdAt.getTime();
            mTime = info.modifiedAt.getTime();
            aTime = info.accessedAt.getTime();
            expect(cTime).toEqual(cTime2);
            expect(mTime).toBeLessThan(aTime);
            expect(mTime).toBeLessThan(now);
            expect(aTime).toBeLessThan(now);

            // Restore.
            delete process.env[ENV_VARS.USER_ID];
            if (originalUserId) process.env[ENV_VARS.USER_ID] = originalUserId;
        });

        test('forEach() should work', async () => {
            const dataset = await getLocalDataset([
                { foo: 'a' },
                { foo: 'b' },
                { foo: 'c' },
                { foo: 'd' },
            ]);

            const items = [];
            const indexes = [];

            const result = await dataset.forEach((item, index) => {
                items.push(item);
                indexes.push(index);
            });
            expect(result).toEqual(undefined);
            expect(items).toEqual([
                { foo: 'a' },
                { foo: 'b' },
                { foo: 'c' },
                { foo: 'd' },
            ]);
            expect(indexes).toEqual([0, 1, 2, 3]);
        });

        test('map() should work', async () => {
            const dataset = await getLocalDataset([
                { foo: 'a' },
                { foo: 'b' },
                { foo: 'c' },
                { foo: 'd' },
            ]);

            const result = await dataset.map((item, index) => {
                return Object.assign({ index, bar: 'xxx' }, item);
            });

            expect(result).toEqual([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);
        });

        test('map() should support promises', async () => {
            const dataset = await getLocalDataset([
                { foo: 'a' },
                { foo: 'b' },
                { foo: 'c' },
                { foo: 'd' },
            ]);

            const result = await dataset.map((item, index) => {
                const res = Object.assign({ index, bar: 'xxx' }, item);
                return Promise.resolve(res);
            });

            expect(result).toEqual([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);
        });

        test('reduce() should work', async () => {
            const dataset = await getLocalDataset([
                { foo: 'a' },
                { foo: 'b' },
                { foo: 'c' },
                { foo: 'd' },
            ]);

            const result = await dataset.reduce((memo, item, index) => {
                item.index = index;
                item.bar = 'xxx';

                return memo.concat(item);
            }, []);

            expect(result).toEqual([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);
        });

        test('reduce() should support promises', async () => {
            const dataset = await getLocalDataset([
                { foo: 'a' },
                { foo: 'b' },
                { foo: 'c' },
                { foo: 'd' },
            ]);

            const result = await dataset.reduce((memo, item, index) => {
                item.index = index;
                item.bar = 'xxx';

                return Promise.resolve(memo.concat(item));
            }, []);

            expect(result).toEqual([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);
        });

        test('reduce() uses first value as memo if no memo is provided', async () => {
            const dataset = await getLocalDataset([
                { foo: 4 },
                { foo: 5 },
                { foo: 2 },
                { foo: 1 },
            ]);

            const calledForIndexes = [];

            const result = await dataset.reduce((memo, item, index) => {
                calledForIndexes.push(index);
                return Promise.resolve(memo.foo > item.foo ? memo : item);
            });

            expect(result.foo).toBe(5);
            expect(calledForIndexes).toEqual([1, 2, 3]);
        });

        test('deprecated delete() still works', async () => {
            const dataset = new DatasetLocal('to-delete', LOCAL_STORAGE_DIR);
            await dataset.pushData({ foo: 'bar' });

            const datasetDir = path.join(LOCAL_STORAGE_DIR, LOCAL_STORAGE_SUBDIR, 'to-delete');
            expectDirNonEmpty(datasetDir);
            await dataset.delete();
            expectDirEmpty(datasetDir);
        });
    });

    describe('remote', () => {
        const mockData = bytes => 'x'.repeat(bytes);

        test('should succesfully save simple data', async () => {
            const dataset = new Dataset('some-id');
            const mock = sinon.mock(apifyClient.datasets);

            mock.expects('putItems')
                .once()
                .withArgs({ datasetId: 'some-id', data: JSON.stringify({ foo: 'bar' }) })
                .returns(Promise.resolve(null));

            mock.expects('putItems')
                .once()
                .withArgs({ datasetId: 'some-id', data: JSON.stringify([{ foo: 'hotel;' }, { foo: 'restaurant' }]) })
                .returns(Promise.resolve(null));

            await dataset.pushData({ foo: 'bar' });
            await dataset.pushData([
                { foo: 'hotel;' },
                { foo: 'restaurant' },
            ]);

            mock.expects('deleteDataset')
                .once()
                .withArgs({ datasetId: 'some-id' })
                .returns(Promise.resolve());
            await dataset.drop();

            mock.verify();
            mock.restore();
        });

        test('should successfully save large data', async () => {
            const half = mockData(MAX_PAYLOAD_SIZE_BYTES / 2);

            const dataset = new Dataset('some-id');
            const mock = sinon.mock(apifyClient.datasets);

            mock.expects('putItems')
                .once()
                .withArgs({ datasetId: 'some-id', data: JSON.stringify([{ foo: half }]) })
                .returns(Promise.resolve(null));

            mock.expects('putItems')
                .once()
                .withArgs({ datasetId: 'some-id', data: JSON.stringify([{ bar: half }]) })
                .returns(Promise.resolve(null));

            await dataset.pushData([
                { foo: half },
                { bar: half },
            ]);

            mock.expects('deleteDataset')
                .once()
                .withArgs({ datasetId: 'some-id' })
                .returns(Promise.resolve());
            await dataset.drop();

            mock.verify();
            mock.restore();
        });

        test('should successfully save lots of small data', async () => {
            const count = 20;
            const string = mockData(MAX_PAYLOAD_SIZE_BYTES / count);
            const chunk = { foo: string, bar: 'baz' };
            const data = Array(count).fill(chunk);
            const expectedFirst = JSON.stringify(Array(count - 1).fill(chunk));
            const expectedSecond = JSON.stringify([chunk]);

            const dataset = new Dataset('some-id');
            const mock = sinon.mock(apifyClient.datasets);

            mock.expects('putItems')
                .once()
                .withArgs({ datasetId: 'some-id', data: expectedFirst })
                .returns(Promise.resolve(null));

            mock.expects('putItems')
                .once()
                .withArgs({ datasetId: 'some-id', data: expectedSecond })
                .returns(Promise.resolve(null));

            await dataset.pushData(data);

            mock.expects('deleteDataset')
                .once()
                .withArgs({ datasetId: 'some-id' })
                .returns(Promise.resolve());
            await dataset.drop();

            mock.verify();
            mock.restore();
        });

        test('should throw on too large file', async () => {
            const mock = sinon.mock(apifyClient.datasets);
            const full = mockData(MAX_PAYLOAD_SIZE_BYTES);
            const dataset = new Dataset('some-id');
            try {
                await dataset.pushData({ foo: full });
                throw new Error('Should fail!');
            } catch (err) {
                expect(err).toBeInstanceOf(Error);
                expect(err.message).toMatch('Data item is too large');
            }
            mock.expects('deleteDataset')
                .once()
                .withArgs({ datasetId: 'some-id' })
                .returns(Promise.resolve());
            await dataset.drop();
            mock.verify();
            mock.restore();
        });
        test('should throw on too large file in an array', async () => {
            const mock = sinon.mock(apifyClient.datasets);
            const full = mockData(MAX_PAYLOAD_SIZE_BYTES);
            const dataset = new Dataset('some-id', 'some-name');
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
            mock.expects('deleteDataset')
                .once()
                .withArgs({ datasetId: 'some-id' })
                .returns(Promise.resolve());
            await dataset.drop();
            mock.verify();
            mock.restore();
        });


        test('getData() should work', async () => {
            const dataset = new Dataset('some-id', 'some-name');
            const mock = sinon.mock(apifyClient.datasets);

            const expected = {
                items: [
                    { foo: 'bar' },
                    { foo: 'hotel' },
                ],
                limit: 2,
                total: 1000,
                offset: 3,
            };

            mock.expects('getItems')
                .once()
                .withArgs({
                    datasetId: 'some-id',
                    limit: 2,
                    offset: 3,
                })
                .returns(Promise.resolve(expected));

            const result = await dataset.getData({ limit: 2, offset: 3 });

            expect(result).toEqual(expected);

            mock.verify();
            mock.restore();
            const stub = sinon.stub(apifyClient.datasets, 'getItems')
                .callsFake(() => { throw new Error('Cannot create a string longer than 0x3fffffe7 characters'); });
            let e;
            try {
                await dataset.getData();
            } catch (err) {
                e = err;
            }
            expect(e.message).toEqual('getData: The response is too large for parsing. You can fix this by lowering the "limit" option.');
            stub.reset();
        });

        test('getInfo() should work', async () => {
            const dataset = new Dataset('some-id', 'some-name');
            const mock = sinon.mock(apifyClient.datasets);

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

            mock.expects('getDataset')
                .once()
                .returns(Promise.resolve(expected));

            const result = await dataset.getInfo();

            expect(result).toEqual(expected);

            mock.verify();
            mock.restore();
        });

        const getRemoteDataset = () => {
            const dataset = new Dataset('some-id', 'some-name');
            const mock = sinon.mock(apifyClient.datasets);

            mock.expects('getItems')
                .once()
                .withArgs({
                    datasetId: 'some-id',
                    limit: 2,
                    offset: 0,
                })
                .returns(Promise.resolve({
                    items: [
                        { foo: 'a' },
                        { foo: 'b' },
                    ],
                    limit: 2,
                    total: 4,
                    offset: 0,
                }));

            mock.expects('getItems')
                .once()
                .withArgs({
                    datasetId: 'some-id',
                    limit: 2,
                    offset: 2,
                })
                .returns(Promise.resolve({
                    items: [
                        { foo: 'c' },
                        { foo: 'd' },
                    ],
                    limit: 2,
                    total: 4,
                    offset: 2,
                }));

            const restoreAndVerify = () => {
                mock.verify();
                mock.restore();
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
                return Object.assign({ index, bar: 'xxx' }, item);
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
                const res = Object.assign({ index, bar: 'xxx' }, item);
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
            const dataset = new Dataset('some-id', 'some-name');
            const mock = sinon.mock(apifyClient.datasets);

            mock.expects('getItems')
                .once()
                .withArgs({
                    datasetId: 'some-id',
                    limit: 2,
                    offset: 0,
                })
                .returns(Promise.resolve({
                    items: [
                        { foo: 4 },
                        { foo: 5 },
                    ],
                    limit: 2,
                    total: 4,
                    offset: 0,
                }));


            mock.expects('getItems')
                .once()
                .withArgs({
                    datasetId: 'some-id',
                    limit: 2,
                    offset: 2,
                })
                .returns(Promise.resolve({
                    items: [
                        { foo: 4 },
                        { foo: 1 },
                    ],
                    limit: 2,
                    total: 4,
                    offset: 2,
                }));

            const calledForIndexes = [];

            const result = await dataset.reduce((memo, item, index) => {
                calledForIndexes.push(index);
                return Promise.resolve(memo.foo > item.foo ? memo : item);
            }, undefined, {
                limit: 2,
            });

            expect(result.foo).toBe(5);
            expect(calledForIndexes).toEqual([1, 2, 3]);
        });

        test('deprecated delete() still works', async () => {
            const mock = sinon.mock(apifyClient.datasets);
            const dataset = new Dataset('some-id', 'some-name');
            mock.expects('deleteDataset')
                .once()
                .withArgs({ datasetId: 'some-id' })
                .resolves();

            await dataset.drop();

            mock.verify();
        });
    });

    describe('Apify.openDataset', () => {
        test('should work', () => {
            const mock = sinon.mock(utils);

            process.env[ENV_VARS.LOCAL_STORAGE_DIR] = LOCAL_STORAGE_DIR;

            mock.expects('openLocalStorage').once();
            Apify.openDataset();

            mock.expects('openLocalStorage').once();
            Apify.openDataset('xxx');
            mock.expects('openRemoteStorage').once();
            Apify.openDataset('xxx', { forceCloud: true });

            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
            process.env[ENV_VARS.TOKEN] = 'xxx';

            mock.expects('openRemoteStorage').once();
            Apify.openDataset();

            delete process.env[ENV_VARS.TOKEN];

            mock.verify();
            mock.restore();
        });
    });

    describe('pushData', () => {
        test('throws on invalid args', async () => {
            process.env[ENV_VARS.DEFAULT_DATASET_ID] = 'some-id-8';
            process.env[ENV_VARS.LOCAL_STORAGE_DIR] = LOCAL_STORAGE_DIR;

            const dataErrMsg = 'Parameter "data" of type Array | Object must be provided';
            await expect(Apify.pushData()).rejects.toThrow(dataErrMsg);
            await expect(Apify.pushData('')).rejects.toThrow(dataErrMsg);
            await expect(Apify.pushData(123)).rejects.toThrow(dataErrMsg);
            await expect(Apify.pushData(true)).rejects.toThrow(dataErrMsg);
            await expect(Apify.pushData(false)).rejects.toThrow(dataErrMsg);
            await expect(Apify.pushData(() => {})).rejects.toThrow(dataErrMsg);

            const circularObj = {};
            circularObj.xxx = circularObj;
            const jsonErrMsg = 'Converting circular structure to JSON';
            await expect(Apify.pushData(circularObj)).rejects.toThrow(jsonErrMsg);

            delete process.env[ENV_VARS.DEFAULT_DATASET_ID];
            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
        });

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

        test('correctly stores records', async () => {
            process.env[ENV_VARS.LOCAL_STORAGE_DIR] = LOCAL_STORAGE_DIR;
            process.env[ENV_VARS.DEFAULT_DATASET_ID] = 'some-id-9';

            await Apify.pushData({ foo: 'bar' });
            await Apify.pushData({ foo: 'hotel' });

            expect(read('some-id-9', 1)).toEqual({ foo: 'bar' });
            expect(read('some-id-9', 2)).toEqual({ foo: 'hotel' });

            delete process.env[ENV_VARS.DEFAULT_DATASET_ID];
            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
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
