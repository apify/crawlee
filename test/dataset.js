import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'babel-polyfill';
import fs from 'fs-extra';
import path from 'path';
import sinon from 'sinon';
import { leftpad, delayPromise } from 'apify-shared/utilities';
import { ENV_VARS } from '../build/constants';
import { LOCAL_FILENAME_DIGITS, Dataset, DatasetLocal, LOCAL_EMULATION_SUBDIR, LOCAL_GET_ITEMS_DEFAULT_LIMIT } from '../build/dataset';
import { apifyClient } from '../build/utils';
import * as Apify from '../build/index';
import { LOCAL_EMULATION_DIR, emptyLocalEmulationSubdir, expectNotLocalEmulation, expectDirEmpty, expectDirNonEmpty } from './_helper';

chai.use(chaiAsPromised);

const read = (datasetName, index) => {
    const fileName = `${leftpad(index, LOCAL_FILENAME_DIGITS, 0)}.json`;
    const filePath = path.join(LOCAL_EMULATION_DIR, LOCAL_EMULATION_SUBDIR, datasetName, fileName);
    const str = fs.readFileSync(path.resolve(filePath));

    return JSON.parse(str);
};

describe('dataset', () => {
    before(() => apifyClient.setOptions({ token: 'xxx' }));
    after(() => apifyClient.setOptions({ token: undefined }));
    beforeEach(() => emptyLocalEmulationSubdir(LOCAL_EMULATION_SUBDIR));
    afterEach(() => emptyLocalEmulationSubdir(LOCAL_EMULATION_SUBDIR));

    describe('local', async () => {
        it('should succesfully save data', async () => {
            const dataset = new DatasetLocal('my-dataset', LOCAL_EMULATION_DIR);

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
            const newDataset = new DatasetLocal('my-dataset', LOCAL_EMULATION_DIR);
            await newDataset.pushData({ foo2: 'bar2' });
            expect(read('my-dataset', 5)).to.be.eql({ foo2: 'bar2' });

            // Delete works.
            const datasetDir = path.join(LOCAL_EMULATION_DIR, LOCAL_EMULATION_SUBDIR, 'my-dataset');
            expectDirNonEmpty(datasetDir);
            await newDataset.delete();
            expectDirEmpty(datasetDir);
        });

        const getLocalDataset = async (data) => {
            const dataset = new DatasetLocal('my-dataset', LOCAL_EMULATION_DIR);
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
        it('should succesfully save data', async () => {
            const dataset = new Dataset('some-id');
            const mock = sinon.mock(apifyClient.datasets);

            mock.expects('putItems')
                .once()
                .withArgs({ datasetId: 'some-id', data: { foo: 'bar' } })
                .returns(Promise.resolve(null));

            mock.expects('putItems')
                .once()
                .withArgs({ datasetId: 'some-id', data: [{ foo: 'hotel;' }, { foo: 'restaurant' }] })
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


        it('getData() should work', async () => {
            const dataset = new Dataset('some-id');
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

        const getRemoteDataset = () => {
            const dataset = new Dataset('some-id');
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
            const dataset = new Dataset('some-id');
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
        it('should open a local dataset when process.env[ENV_VARS.LOCAL_EMULATION_DIR] is set', async () => {
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = LOCAL_EMULATION_DIR;

            const dataset = await Apify.openDataset('some-id-2');
            expect(dataset).to.be.instanceof(DatasetLocal);
            expect(dataset).not.to.be.instanceof(Dataset);

            delete process.env[ENV_VARS.LOCAL_EMULATION_DIR];
        });

        it('should reuse cached dataset instances', async () => {
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = LOCAL_EMULATION_DIR;

            const dataset1 = await Apify.openDataset('some-id-3');
            const dataset2 = await Apify.openDataset('some-id-3');
            const dataset3 = new DatasetLocal('some-id-3', LOCAL_EMULATION_DIR);

            expect(dataset1).to.be.instanceof(DatasetLocal);
            expect(dataset2).to.be.instanceof(DatasetLocal);
            expect(dataset3).to.be.instanceof(DatasetLocal);

            expect(dataset1).to.be.equal(dataset2);
            expect(dataset1).not.to.be.equal(dataset3);

            delete process.env[ENV_VARS.LOCAL_EMULATION_DIR];

            // Here must be some timeout to don't finish before initialization of dataset finishes.
            // Otherwise we delete the directory and scandir will throw ENOENT: no such file or directory
            await delayPromise(100);
        });

        it('should open default dataset when datasetIdOrName is not provided', async () => {
            process.env[ENV_VARS.DEFAULT_DATASET_ID] = 'some-id-4';
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = LOCAL_EMULATION_DIR;

            const dataset = await Apify.openDataset();
            expect(dataset.datasetId).to.be.eql('some-id-4');
            expect(dataset).to.be.instanceof(DatasetLocal);

            delete process.env[ENV_VARS.LOCAL_EMULATION_DIR];
            process.env[ENV_VARS.DEFAULT_DATASET_ID] = 'some-id-5';
            expectNotLocalEmulation();

            const dataset2 = await Apify.openDataset();
            expect(dataset2.datasetId).to.be.eql('some-id-5');
            expect(dataset2).to.be.instanceof(Dataset);

            delete process.env[ENV_VARS.DEFAULT_DATASET_ID];
        });

        it('should open remote dataset when process.env[ENV_VARS.LOCAL_EMULATION_DIR] is NOT set', async () => {
            expectNotLocalEmulation();

            const mock = sinon.mock(apifyClient.datasets);

            // First when used with id it only requests store object.
            mock.expects('getDataset')
                .once()
                .withArgs({ datasetId: 'some-id-6' })
                .returns(Promise.resolve({ id: 'some-id-6' }));
            const dataset = await Apify.openDataset('some-id-6');
            expect(dataset.datasetId).to.be.eql('some-id-6');
            expect(dataset).to.be.instanceof(Dataset);

            // Then used with name it requests store object, gets empty response
            // so then it creates dataset.
            mock.expects('getDataset')
                .once()
                .withArgs({ datasetId: 'some-name-7' })
                .returns(Promise.resolve(null));
            mock.expects('getOrCreateDataset')
                .once()
                .withArgs({ datasetName: 'some-name-7' })
                .returns(Promise.resolve({ id: 'some-id-7' }));

            const dataset2 = await Apify.openDataset('some-name-7');
            expect(dataset2.datasetId).to.be.eql('some-id-7');
            expect(dataset2).to.be.instanceof(Dataset);

            mock.verify();
            mock.restore();
        });
    });

    describe('pushData', async () => {
        it('throws on invalid args', async () => {
            process.env[ENV_VARS.DEFAULT_DATASET_ID] = 'some-id-8';
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = LOCAL_EMULATION_DIR;

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
        });

        it('throws if DEFAULT_DATASET_ID env var is not defined', async () => {
            process.env[ENV_VARS.DEFAULT_DATASET_ID] = '';
            await expect(Apify.pushData({ something: 123 })).to.be.rejectedWith(Error);

            delete process.env[ENV_VARS.DEFAULT_DATASET_ID];
            await expect(Apify.pushData({ something: 123 })).to.be.rejectedWith(Error);
        });

        it('correctly stores records', async () => {
            process.env[ENV_VARS.DEFAULT_DATASET_ID] = 'some-id-9';
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = LOCAL_EMULATION_DIR;

            await Apify.pushData({ foo: 'bar' });
            await Apify.pushData({ foo: 'hotel' });

            expect(read('some-id-9', 1)).to.be.eql({ foo: 'bar' });
            expect(read('some-id-9', 2)).to.be.eql({ foo: 'hotel' });

            delete process.env[ENV_VARS.LOCAL_EMULATION_DIR];
        });
    });
});
