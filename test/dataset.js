import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'babel-polyfill';
import fs from 'fs-extra';
import path from 'path';
import sinon from 'sinon';
import { leftpad } from 'apify-shared/utilities';
import { ENV_VARS } from '../build/constants';
import { LEFTPAD_COUNT, DatasetRemote, DatasetLocal } from '../build/dataset';
import { apifyClient } from '../build/utils';
import * as Apify from '../build/index';

chai.use(chaiAsPromised);

const TMP_DIR_PATH = path.resolve('tmp');
const APIFY_LOCAL_EMULATION_DIR = path.join('tmp', 'local-emulation-dir');
const APIFY_LOCAL_EMULATION_DIR_PATH = path.resolve(APIFY_LOCAL_EMULATION_DIR);

if (!fs.existsSync(TMP_DIR_PATH)) fs.mkdirSync(TMP_DIR_PATH);
if (fs.existsSync(APIFY_LOCAL_EMULATION_DIR_PATH)) fs.removeSync(APIFY_LOCAL_EMULATION_DIR_PATH);
fs.mkdirSync(APIFY_LOCAL_EMULATION_DIR_PATH);

const expectNotLocal = () => expect(process.env[ENV_VARS.LOCAL_EMULATION_DIR]).to.be.a('undefined');

describe('dataset', () => {
    before(() => {
        apifyClient.setOptions({ token: 'xxx' });
    });

    after(() => {
        apifyClient.setOptions({ token: undefined });
    });

    describe('local', async () => {
        it('should work', async () => {
            const dataset = new DatasetLocal('my-dataset', APIFY_LOCAL_EMULATION_DIR);

            await dataset.pushData({ foo: 'bar' });
            await dataset.pushData({ foo: 'hotel' });
            await dataset.pushData([
                { foo: 'from-array-1', arr: [1, 2, 3] },
                { foo: 'from-array-1', arr: [1, 2, 3] },
            ]);

            const read = (index) => {
                const fileName = `${leftpad(index, LEFTPAD_COUNT, 0)}.json`;
                const filePath = path.join(APIFY_LOCAL_EMULATION_DIR_PATH, 'my-dataset', fileName);
                const str = fs.readFileSync(filePath);

                return JSON.parse(str);
            };

            expect(read(1)).to.be.eql({ foo: 'bar' });
            expect(read(2)).to.be.eql({ foo: 'hotel' });
            expect(read(3)).to.be.eql({ foo: 'from-array-1', arr: [1, 2, 3] });
            expect(read(4)).to.be.eql({ foo: 'from-array-1', arr: [1, 2, 3] });
        });
    });

    describe('remote', async () => {
        it('should work', async () => {
            const dataset = new DatasetRemote('some-id');

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

            mock.verify();
            mock.restore();
        });
    });

    describe('Apify.openDataset', async () => {
        it('should open a local store when process.env[ENV_VARS.LOCAL_EMULATION_DIR] is set', async () => {
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = APIFY_LOCAL_EMULATION_DIR;

            const dataset = await Apify.openDataset('some-id-2');
            expect(dataset).to.be.instanceof(DatasetLocal);
            expect(dataset).not.to.be.instanceof(DatasetRemote);

            delete process.env[ENV_VARS.LOCAL_EMULATION_DIR];
        });

        it('should reuse cached store instances', async () => {
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = APIFY_LOCAL_EMULATION_DIR;

            const dataset1 = await Apify.openDataset('some-id-3');
            const dataset2 = await Apify.openDataset('some-id-3');
            const dataset3 = new DatasetLocal('some-id-3', APIFY_LOCAL_EMULATION_DIR);

            expect(dataset1).to.be.instanceof(DatasetLocal);
            expect(dataset2).to.be.instanceof(DatasetLocal);
            expect(dataset3).to.be.instanceof(DatasetLocal);

            expect(dataset1).to.be.equal(dataset2);
            expect(dataset1).to.be.eql(dataset3);
            expect(dataset1).not.to.be.equal(dataset3);

            delete process.env[ENV_VARS.LOCAL_EMULATION_DIR];
        });

        it('should open default dataset when datasetIdOrName is not provided', async () => {
            process.env[ENV_VARS.DEFAULT_DATASET_ID] = 'some-id-4';
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = APIFY_LOCAL_EMULATION_DIR;

            const dataset = await Apify.openDataset();
            expect(dataset.datasetId).to.be.eql('some-id-4');
            expect(dataset).to.be.instanceof(DatasetLocal);

            delete process.env[ENV_VARS.LOCAL_EMULATION_DIR];
            process.env[ENV_VARS.DEFAULT_DATASET_ID] = 'some-id-5';
            expectNotLocal();

            const dataset2 = await Apify.openDataset();
            expect(dataset2.datasetId).to.be.eql('some-id-5');
            expect(dataset2).to.be.instanceof(DatasetRemote);

            delete process.env[ENV_VARS.DEFAULT_DATASET_ID];
        });

        it('should open remote dataset when process.env[ENV_VARS.LOCAL_EMULATION_DIR] is NOT set', async () => {
            expectNotLocal();

            const mock = sinon.mock(apifyClient.datasets);

            // First when used with id it only requests store object.
            mock.expects('getDataset')
                .once()
                .withArgs({ datasetId: 'some-id-6' })
                .returns(Promise.resolve({ id: 'some-id-6' }));
            const dataset = await Apify.openDataset('some-id-6');
            expect(dataset.datasetId).to.be.eql('some-id-6');
            expect(dataset).to.be.instanceof(DatasetRemote);

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
            expect(dataset2).to.be.instanceof(DatasetRemote);

            mock.verify();
            mock.restore();
        });
    });

    describe('pushData', async () => {
        it('throws on invalid args', async () => {
            process.env[ENV_VARS.DEFAULT_DATASET_ID] = 'some-id-8';
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = APIFY_LOCAL_EMULATION_DIR;

            const dataErrMsg = 'Parameter "data" of type Array | Object must be provided';
            await expect(Apify.pushData()).to.be.rejectedWith(dataErrMsg);
            await expect(Apify.pushData('')).to.be.rejectedWith(dataErrMsg);
            await expect(Apify.pushData(123)).to.be.rejectedWith(dataErrMsg);
            await expect(Apify.pushData(true)).to.be.rejectedWith(dataErrMsg);
            await expect(Apify.pushData(false)).to.be.rejectedWith(dataErrMsg);
            await expect(Apify.pushData(() => {})).to.be.rejectedWith(dataErrMsg);

            const circularObj = { xxx: circularObj };
            circularObj.xxx = circularObj;
            const jsonErrMsg = 'The "data" parameter cannot be stringified to JSON';
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
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = APIFY_LOCAL_EMULATION_DIR;

            await Apify.pushData({ foo: 'bar' });
            await Apify.pushData({ foo: 'hotel' });

            const read = (index) => {
                const fileName = `${leftpad(index, LEFTPAD_COUNT, 0)}.json`;
                const filePath = path.join(APIFY_LOCAL_EMULATION_DIR_PATH, 'my-dataset', fileName);
                const str = fs.readFileSync(filePath);

                return JSON.parse(str);
            };

            expect(read(1)).to.be.eql({ foo: 'bar' });
            expect(read(2)).to.be.eql({ foo: 'hotel' });

            delete process.env[ENV_VARS.LOCAL_EMULATION_DIR];
        });
    });
});
