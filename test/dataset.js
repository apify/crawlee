import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
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

chai.use(chaiAsPromised);

const read = (datasetName, index) => {
    const fileName = `${leftpad(index, LOCAL_FILENAME_DIGITS, 0)}.json`;
    const filePath = path.join(LOCAL_STORAGE_DIR, LOCAL_STORAGE_SUBDIR, datasetName, fileName);
    const str = fs.readFileSync(path.resolve(filePath));

    return JSON.parse(str);
};

describe('dataset', () => {
    before(() => apifyClient.setOptions({ token: 'xxx' }));
    after(() => apifyClient.setOptions({ token: undefined }));
    beforeEach(() => emptyLocalStorageSubdir(LOCAL_STORAGE_SUBDIR));
    afterEach(() => emptyLocalStorageSubdir(LOCAL_STORAGE_SUBDIR));

    describe('local', async () => {
        it('should successfully save data', async () => {
            const dataset = new DatasetLocal('my-dataset', LOCAL_STORAGE_DIR);

            await dataset.pushData({ foo: 'bar' });
            await dataset.pushData({ foo: 'hotel' });
            await dataset.pushData([
                { foo: 'from-array-1', arr: [1, 2, 3] },
                { foo: 'from-array-1', arr: [1, 2, 3] },
            ]);

            expect(read('my-dataset', 1)).to.be.eql({ foo: 'bar' });
            expect(read('my-dataset', 2)).to.be.eql({ foo: 'hotel' });
            expect(read('my-dataset', 3)).to.be.eql({ foo: 'from-array-1', arr: [1, 2, 3] });
            expect(read('my-dataset', 4)).to.be.eql({ foo: 'from-array-1', arr: [1, 2, 3] });

            // Correctly initializes the state.
            const newDataset = new DatasetLocal('my-dataset', LOCAL_STORAGE_DIR);
            await newDataset.pushData({ foo2: 'bar2' });
            expect(read('my-dataset', 5)).to.be.eql({ foo2: 'bar2' });

            // Delete works.
            const datasetDir = path.join(LOCAL_STORAGE_DIR, LOCAL_STORAGE_SUBDIR, 'my-dataset');
            expectDirNonEmpty(datasetDir);
            await newDataset.delete();
            expectDirEmpty(datasetDir);
        });

        const getLocalDataset = async (data) => {
            const dataset = new DatasetLocal('my-dataset', LOCAL_STORAGE_DIR);
            await dataset.pushData(data);

            return dataset;
        };

        it('getData() should work', async () => {
            const dataset = await getLocalDataset([
                { foo: 'a' },
                { foo: 'b' },
                { foo: 'c' },
                { foo: 'd' },
            ]);

            expect(await dataset.getData()).to.be.eql({
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

            expect(await dataset.getData({ offset: 2 })).to.be.eql({
                items: [
                    { foo: 'c' },
                    { foo: 'd' },
                ],
                total: 4,
                offset: 2,
                count: 2,
                limit: LOCAL_GET_ITEMS_DEFAULT_LIMIT,
            });

            expect(await dataset.getData({ offset: 1, limit: 2 })).to.be.eql({
                items: [
                    { foo: 'b' },
                    { foo: 'c' },
                ],
                total: 4,
                offset: 1,
                count: 2,
                limit: 2,
            });

            expect(await dataset.getData({ offset: 10 })).to.be.eql({
                items: [],
                total: 4,
                offset: 10,
                count: 0,
                limit: LOCAL_GET_ITEMS_DEFAULT_LIMIT,
            });
        });

        it('getInfo() should work', async () => {
            const datasetName = 'stats-dataset';
            const dataset = new DatasetLocal(datasetName, LOCAL_STORAGE_DIR);
            await Apify.utils.sleep(2);

            // Save orig env var since it persists over tests.
            const originalUserId = process.env[ENV_VARS.USER_ID];
            // Try empty ID
            delete process.env[ENV_VARS.USER_ID];

            let info = await dataset.getInfo();
            expect(info).to.be.an('object');
            expect(info.id).to.be.eql(datasetName);
            expect(info.name).to.be.eql(datasetName);
            expect(info.userId).to.be.eql(null);
            expect(info.itemCount).to.be.eql(0);
            expect(info.cleanItemCount).to.be.eql(0);
            const cTime = info.createdAt.getTime();
            let mTime = info.modifiedAt.getTime();
            expect(cTime).to.be.below(Date.now() + 1);
            expect(cTime).to.be.eql(mTime);

            await dataset.pushData([
                { foo: 'a' },
                { foo: 'b' },
                { foo: 'c' },
                { foo: 'd' },
            ]);
            await Apify.utils.sleep(2);

            info = await dataset.getInfo();
            expect(info).to.be.an('object');
            expect(info.id).to.be.eql(datasetName);
            expect(info.name).to.be.eql(datasetName);
            expect(info.userId).to.be.eql(null);
            expect(info.itemCount).to.be.eql(4);
            expect(info.cleanItemCount).to.be.eql(4);
            mTime = info.modifiedAt.getTime();
            let aTime = info.accessedAt.getTime();
            expect(cTime).to.be.below(Date.now());
            expect(cTime).to.be.below(mTime);
            expect(mTime).to.be.eql(aTime);

            await dataset.getData();
            await Apify.utils.sleep(2);
            const now = Date.now();
            await Apify.utils.sleep(2);

            // Try setting an ID
            const userId = 'some_ID';
            process.env[ENV_VARS.USER_ID] = userId;

            info = await dataset.getInfo();
            expect(info).to.be.an('object');
            expect(info.id).to.be.eql(datasetName);
            expect(info.name).to.be.eql(datasetName);
            expect(info.userId).to.be.eql(userId);
            expect(info.itemCount).to.be.eql(4);
            expect(info.cleanItemCount).to.be.eql(4);
            const cTime2 = info.createdAt.getTime();
            mTime = info.modifiedAt.getTime();
            aTime = info.accessedAt.getTime();
            expect(cTime).to.be.eql(cTime2);
            expect(mTime).to.be.below(aTime);
            expect(mTime).to.be.below(now);
            expect(aTime).to.be.below(now);

            // Restore.
            delete process.env[ENV_VARS.USER_ID];
            if (originalUserId) process.env[ENV_VARS.USER_ID] = originalUserId;
        });

        it('forEach() should work', async () => {
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
            expect(result).to.be.eql(undefined);
            expect(items).to.be.eql([
                { foo: 'a' },
                { foo: 'b' },
                { foo: 'c' },
                { foo: 'd' },
            ]);
            expect(indexes).to.be.eql([0, 1, 2, 3]);
        });

        it('map() should work', async () => {
            const dataset = await getLocalDataset([
                { foo: 'a' },
                { foo: 'b' },
                { foo: 'c' },
                { foo: 'd' },
            ]);

            const result = await dataset.map((item, index) => {
                return Object.assign({ index, bar: 'xxx' }, item);
            });

            expect(result).to.be.eql([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);
        });

        it('map() should support promises', async () => {
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

            expect(result).to.be.eql([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);
        });

        it('reduce() should work', async () => {
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

            expect(result).to.be.eql([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);
        });

        it('reduce() should support promises', async () => {
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

            expect(result).to.be.eql([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);
        });

        it('reduce() uses first value as memo if no memo is provided', async () => {
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

            expect(result.foo).to.be.eql(5);
            expect(calledForIndexes).to.be.eql([1, 2, 3]);
        });
    });

    describe('remote', async () => {
        const mockData = bytes => 'x'.repeat(bytes);

        it('should succesfully save simple data', async () => {
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
            await dataset.delete();

            mock.verify();
            mock.restore();
        });

        it('should successfully save large data', async () => {
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
            await dataset.delete();

            mock.verify();
            mock.restore();
        });

        it('should successfully save lots of small data', async () => {
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
            await dataset.delete();

            mock.verify();
            mock.restore();
        });

        it('should throw on too large file', async () => {
            const mock = sinon.mock(apifyClient.datasets);
            const full = mockData(MAX_PAYLOAD_SIZE_BYTES);
            const dataset = new Dataset('some-id');
            try {
                await dataset.pushData({ foo: full });
                throw new Error('Should fail!');
            } catch (err) {
                expect(err).to.be.an('error');
                expect(err.message).to.include('Data item is too large');
            }
            mock.expects('deleteDataset')
                .once()
                .withArgs({ datasetId: 'some-id' })
                .returns(Promise.resolve());
            await dataset.delete();
            mock.verify();
            mock.restore();
        });
        it('should throw on too large file in an array', async () => {
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
                expect(err).to.be.an('error');
                expect(err.message).to.include('Data item at index 3 is too large');
            }
            mock.expects('deleteDataset')
                .once()
                .withArgs({ datasetId: 'some-id' })
                .returns(Promise.resolve());
            await dataset.delete();
            mock.verify();
            mock.restore();
        });


        it('getData() should work', async () => {
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

            expect(result).to.be.eql(expected);

            mock.verify();
            mock.restore();
        });

        it('getInfo() should work', async () => {
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

            expect(result).to.be.eql(expected);

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


        it('forEach() should work', async () => {
            const { dataset, restoreAndVerify } = getRemoteDataset();

            const items = [];
            const indexes = [];
            const result = await dataset.forEach((item, index) => {
                items.push(item);
                indexes.push(index);
            }, {
                limit: 2,
            });
            expect(result).to.be.eql(undefined);
            expect(items).to.be.eql([
                { foo: 'a' },
                { foo: 'b' },
                { foo: 'c' },
                { foo: 'd' },
            ]);
            expect(indexes).to.be.eql([0, 1, 2, 3]);

            restoreAndVerify();
        });

        it('map() should work', async () => {
            const { dataset, restoreAndVerify } = getRemoteDataset();

            const result = await dataset.map((item, index) => {
                return Object.assign({ index, bar: 'xxx' }, item);
            }, {
                limit: 2,
            });

            expect(result).to.be.eql([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);

            restoreAndVerify();
        });

        it('map() should support promises', async () => {
            const { dataset, restoreAndVerify } = getRemoteDataset();

            const result = await dataset.map((item, index) => {
                const res = Object.assign({ index, bar: 'xxx' }, item);
                return Promise.resolve(res);
            }, {
                limit: 2,
            });

            expect(result).to.be.eql([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);

            restoreAndVerify();
        });

        it('reduce() should work', async () => {
            const { dataset, restoreAndVerify } = getRemoteDataset();

            const result = await dataset.reduce((memo, item, index) => {
                item.index = index;
                item.bar = 'xxx';

                return memo.concat(item);
            }, [], {
                limit: 2,
            });

            expect(result).to.be.eql([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);

            restoreAndVerify();
        });

        it('reduce() should support promises', async () => {
            const { dataset, restoreAndVerify } = getRemoteDataset();

            const result = await dataset.reduce((memo, item, index) => {
                item.index = index;
                item.bar = 'xxx';

                return Promise.resolve(memo.concat(item));
            }, [], {
                limit: 2,
            });

            expect(result).to.be.eql([
                { foo: 'a', index: 0, bar: 'xxx' },
                { foo: 'b', index: 1, bar: 'xxx' },
                { foo: 'c', index: 2, bar: 'xxx' },
                { foo: 'd', index: 3, bar: 'xxx' },
            ]);

            restoreAndVerify();
        });

        it('reduce() uses first value as memo if no memo is provided', async () => {
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

            expect(result.foo).to.be.eql(5);
            expect(calledForIndexes).to.be.eql([1, 2, 3]);
        });
    });

    describe('Apify.openDataset', async () => {
        it('should work', () => {
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

    describe('pushData', async () => {
        it('throws on invalid args', async () => {
            process.env[ENV_VARS.DEFAULT_DATASET_ID] = 'some-id-8';
            process.env[ENV_VARS.LOCAL_STORAGE_DIR] = LOCAL_STORAGE_DIR;

            const dataErrMsg = 'Parameter "data" of type Array | Object must be provided';
            await expect(Apify.pushData()).to.be.rejectedWith(dataErrMsg);
            await expect(Apify.pushData('')).to.be.rejectedWith(dataErrMsg);
            await expect(Apify.pushData(123)).to.be.rejectedWith(dataErrMsg);
            await expect(Apify.pushData(true)).to.be.rejectedWith(dataErrMsg);
            await expect(Apify.pushData(false)).to.be.rejectedWith(dataErrMsg);
            await expect(Apify.pushData(() => {})).to.be.rejectedWith(dataErrMsg);

            const circularObj = {};
            circularObj.xxx = circularObj;
            const jsonErrMsg = 'Converting circular structure to JSON';
            await expect(Apify.pushData(circularObj)).to.be.rejectedWith(jsonErrMsg);

            delete process.env[ENV_VARS.DEFAULT_DATASET_ID];
            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
        });

        it('throws if DEFAULT_DATASET_ID env var is not defined and we use cloud storage', async () => {
            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
            process.env[ENV_VARS.TOKEN] = 'xxx';

            process.env[ENV_VARS.DEFAULT_DATASET_ID] = '';
            await expect(Apify.pushData({ something: 123 })).to.be.rejectedWith(Error);

            delete process.env[ENV_VARS.DEFAULT_DATASET_ID];
            await expect(Apify.pushData({ something: 123 })).to.be.rejectedWith(Error);

            delete process.env[ENV_VARS.TOKEN];
        });

        it('correctly stores records', async () => {
            process.env[ENV_VARS.LOCAL_STORAGE_DIR] = LOCAL_STORAGE_DIR;
            process.env[ENV_VARS.DEFAULT_DATASET_ID] = 'some-id-9';

            await Apify.pushData({ foo: 'bar' });
            await Apify.pushData({ foo: 'hotel' });

            expect(read('some-id-9', 1)).to.be.eql({ foo: 'bar' });
            expect(read('some-id-9', 2)).to.be.eql({ foo: 'hotel' });

            delete process.env[ENV_VARS.DEFAULT_DATASET_ID];
            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
        });
    });

    describe('utils', async () => {
        it('checkAndSerialize() works', () => {
            // Basic
            const obj = { foo: 'bar' };
            const json = JSON.stringify(obj);
            expect(checkAndSerialize({}, 100)).to.be.eql('{}');
            expect(checkAndSerialize(obj, 100)).to.be.eql(json);
            // With index
            expect(checkAndSerialize(obj, 100, 1)).to.be.eql(json);
            // Too large
            expect(() => checkAndSerialize(obj, 5)).to.throw(Error, 'Data item is too large');
            expect(() => checkAndSerialize(obj, 5, 7)).to.throw(Error, 'at index 7');
            // Bad JSON
            const bad = {};
            bad.bad = bad;
            expect(() => checkAndSerialize(bad, 100)).to.throw(Error, 'not serializable');
            // Bad data
            const str = 'hello';
            expect(() => checkAndSerialize(str, 100)).to.throw(Error, 'not serializable');
            expect(() => checkAndSerialize([], 100)).to.throw(Error, 'not serializable');
            expect(() => checkAndSerialize([str, str], 100)).to.throw(Error, 'not serializable');
        });
        it('chunkBySize', () => {
            const obj = { foo: 'bar' };
            const json = JSON.stringify(obj);
            const size = Buffer.byteLength(json);
            const triple = [json, json, json];
            const originalTriple = [obj, obj, obj];
            const chunk = `[${json}]`;
            const tripleChunk = `[${json},${json},${json}]`;
            const tripleSize = Buffer.byteLength(tripleChunk);
            // Empty array
            expect(chunkBySize([], 10)).to.be.eql([]);
            // Fits easily
            expect(chunkBySize([json], size + 10)).to.be.eql([json]);
            expect(chunkBySize(triple, tripleSize + 10)).to.be.eql([tripleChunk]);
            // Parses back to original objects
            expect(originalTriple).to.be.eql(JSON.parse(tripleChunk));
            // Fits exactly
            expect(chunkBySize([json], size)).to.be.eql([json]);
            expect(chunkBySize(triple, tripleSize)).to.be.eql([tripleChunk]);
            // Chunks large items individually
            expect(chunkBySize(triple, size)).to.be.eql(triple);
            expect(chunkBySize(triple, size + 1)).to.be.eql(triple);
            expect(chunkBySize(triple, size + 2)).to.be.eql([chunk, chunk, chunk]);
            // Chunks smaller items together
            expect(chunkBySize(triple, (2 * size) + 3)).to.be.eql([`[${json},${json}]`, chunk]);
            expect(chunkBySize([...triple, ...triple], (2 * size) + 3)).to.be.eql([`[${json},${json}]`, `[${json},${json}]`, `[${json},${json}]`]);
        });
    });
});
