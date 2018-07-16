import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'babel-polyfill';
import sinon from 'sinon';
import path from 'path';
import { ENV_VARS } from '../build/constants';
import { KeyValueStoreLocal, KeyValueStore, maybeStringify, LOCAL_EMULATION_SUBDIR } from '../build/key_value_store';
import { apifyClient } from '../build/utils';
import * as Apify from '../build/index';
import { LOCAL_EMULATION_DIR, emptyLocalEmulationSubdir, expectNotLocalEmulation, expectDirEmpty, expectDirNonEmpty } from './_helper';

chai.use(chaiAsPromised);

describe('KeyValueStore', () => {
    before(() => apifyClient.setOptions({ token: 'xxx' }));
    after(() => apifyClient.setOptions({ token: undefined }));
    beforeEach(() => emptyLocalEmulationSubdir(LOCAL_EMULATION_SUBDIR));
    afterEach(() => emptyLocalEmulationSubdir(LOCAL_EMULATION_SUBDIR));

    describe('maybeStringify()', () => {
        it('should work', () => {
            expect(maybeStringify({ foo: 'bar' }, { contentType: null })).to.be.eql('{\n  "foo": "bar"\n}');
            expect(maybeStringify({ foo: 'bar' }, { contentType: undefined })).to.be.eql('{\n  "foo": "bar"\n}');

            expect(maybeStringify('xxx', { contentType: undefined })).to.be.eql('"xxx"');
            expect(maybeStringify('xxx', { contentType: 'something' })).to.be.eql('xxx');

            const obj = {};
            obj.self = obj;
            expect(() => maybeStringify(obj, { contentType: null }))
                .to.throw('The "value" parameter cannot be stringified to JSON: Converting circular structure to JSON');
        });
    });

    describe('local', async () => {
        it('should work', async () => {
            const store = new KeyValueStoreLocal('my-store-id', LOCAL_EMULATION_DIR);
            const store2 = new KeyValueStoreLocal('another-store-id', LOCAL_EMULATION_DIR);
            const buffer = Buffer.from('some text value');

            await store.setValue('key-obj', { foo: 'bar' });
            await store.setValue('key-string', 'xxxx', { contentType: 'text/plain' });
            await store.setValue('key-buffer', buffer, { contentType: 'image/jpeg' });
            await store2.setValue('key-obj', { foo: 'hotel' });
            await store2.setValue('key-string', 'yyyy', { contentType: 'text/plain' });

            // Try to read store2/key-string.
            expect(await store2.getValue('key-string')).to.be.eql('yyyy');

            // Try to delete store2/key-string with an error.
            try {
                await store2.setValue('key-string', null, { contentType: 'text/plain' });
                throw new Error('This should throw!!!');
            } catch (err) {
                expect(err).to.be.a('error');
            }

            // Try to delete store2/key-string again.
            expect(await store2.getValue('key-string')).to.be.eql('yyyy');

            // Check that it doesn't exist.
            await store2.setValue('key-string', null);

            expect(await store.getValue('key-obj')).to.be.eql({ foo: 'bar' });
            expect(await store.getValue('key-string')).to.be.eql('xxxx');
            expect(await store.getValue('key-buffer')).to.be.eql(buffer);
            expect(await store.getValue('key-nonexist')).to.be.eql(null);
            expect(await store2.getValue('key-obj')).to.be.eql({ foo: 'hotel' });

            // Delete works.
            const storeDir = path.join(LOCAL_EMULATION_DIR, LOCAL_EMULATION_SUBDIR, 'my-store-id');
            expectDirNonEmpty(storeDir);
            await store.delete();
            expectDirEmpty(storeDir);
        });

        it('should throw on invalid keys', async () => {
            const store = new KeyValueStoreLocal('my-store-id', LOCAL_EMULATION_DIR);
            const INVALID_CHARACTERS = '?|\\/"*<>%:';
            let counter = 0;

            for (const char of INVALID_CHARACTERS) { // eslint-disable-line
                try {
                    await store.setValue(`my_id_${char}`);
                } catch (e) {
                    counter++;
                }
            }

            expect(counter).to.be.eql(INVALID_CHARACTERS.length);
        });
    });

    describe('remote', async () => {
        it('works', async () => {
            const store = new KeyValueStore('some-id-1');
            const mock = sinon.mock(apifyClient.keyValueStores);
            const record = { foo: 'bar' };
            const recordStr = JSON.stringify(record, null, 2);

            // Set.
            mock.expects('putRecord')
                .once()
                .withArgs({
                    storeId: 'some-id-1',
                    key: 'key-1',
                    body: recordStr,
                    contentType: 'application/json; charset=utf-8',
                })
                .returns(Promise.resolve(null));
            await store.setValue('key-1', record);

            // Get.
            mock.expects('getRecord')
                .once()
                .withArgs({
                    storeId: 'some-id-1',
                    key: 'key-1',
                })
                .returns(Promise.resolve({ body: record, contentType: 'application/json; charset=utf-8' }));
            const response = await store.getValue('key-1');
            expect(response).to.be.eql(record);

            // Delete.
            mock.expects('deleteRecord')
                .once()
                .withArgs({
                    storeId: 'some-id-1',
                    key: 'key-1',
                })
                .returns(Promise.resolve(null));
            await store.setValue('key-1', null);

            // Delete.
            mock.expects('deleteStore')
                .once()
                .withArgs({
                    storeId: 'some-id-1',
                })
                .returns(Promise.resolve());
            await store.delete();

            mock.verify();
            mock.restore();
        });
    });

    describe('Apify.openKeyValueStore', async () => {
        it('should open a local store when process.env[ENV_VARS.LOCAL_EMULATION_DIR] is set', async () => {
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = LOCAL_EMULATION_DIR;

            const store = await Apify.openKeyValueStore('some-id-2');
            expect(store).to.be.instanceof(KeyValueStoreLocal);
            expect(store).not.to.be.instanceof(KeyValueStore);

            delete process.env[ENV_VARS.LOCAL_EMULATION_DIR];
        });

        it('should reuse cached store instances', async () => {
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = LOCAL_EMULATION_DIR;

            const store1 = await Apify.openKeyValueStore('some-id-3');
            const store2 = await Apify.openKeyValueStore('some-id-3');
            const store3 = new KeyValueStoreLocal('some-id-3', LOCAL_EMULATION_DIR);

            expect(store1).to.be.instanceof(KeyValueStoreLocal);
            expect(store2).to.be.instanceof(KeyValueStoreLocal);
            expect(store3).to.be.instanceof(KeyValueStoreLocal);

            expect(store1).to.be.equal(store2);
            expect(store1).not.to.be.equal(store3);

            delete process.env[ENV_VARS.LOCAL_EMULATION_DIR];
        });

        it('should open default store when storeIdOrName is not provided', async () => {
            process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID] = 'some-id-4';
            process.env[ENV_VARS.LOCAL_EMULATION_DIR] = LOCAL_EMULATION_DIR;

            const store = await Apify.openKeyValueStore();
            expect(store.storeId).to.be.eql('some-id-4');
            expect(store).to.be.instanceof(KeyValueStoreLocal);

            delete process.env[ENV_VARS.LOCAL_EMULATION_DIR];
            process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID] = 'some-id-5';
            expectNotLocalEmulation();

            const store2 = await Apify.openKeyValueStore();
            expect(store2.storeId).to.be.eql('some-id-5');
            expect(store2).to.be.instanceof(KeyValueStore);

            delete process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID];
        });

        it('should open remote store when process.env[ENV_VARS.LOCAL_EMULATION_DIR] is NOT set', async () => {
            expectNotLocalEmulation();

            const mock = sinon.mock(apifyClient.keyValueStores);

            // First when used with id it only requests store object.
            mock.expects('getStore')
                .once()
                .withArgs({ storeId: 'some-id-6' })
                .returns(Promise.resolve({ id: 'some-id-6' }));
            const store = await Apify.openKeyValueStore('some-id-6');
            expect(store.storeId).to.be.eql('some-id-6');
            expect(store).to.be.instanceof(KeyValueStore);

            // Then used with name it requests store object, gets empty response
            // so then it creates dataset.
            mock.expects('getStore')
                .once()
                .withArgs({ storeId: 'some-name-7' })
                .returns(Promise.resolve(null));
            mock.expects('getOrCreateStore')
                .once()
                .withArgs({ storeName: 'some-name-7' })
                .returns(Promise.resolve({ id: 'some-id-7' }));

            const store2 = await Apify.openKeyValueStore('some-name-7');
            expect(store2.storeId).to.be.eql('some-id-7');
            expect(store2).to.be.instanceof(KeyValueStore);

            mock.verify();
            mock.restore();
        });
    });

    describe('getValue', async () => {
        it('throws on invalid args', async () => {
            process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID] = '1234';
            await expect(Apify.getValue()).to.be.rejectedWith('Parameter "key" of type String must be provided');
            await expect(Apify.getValue({})).to.be.rejectedWith('Parameter "key" of type String must be provided');
            await expect(Apify.getValue('')).to.be.rejectedWith('The "key" parameter cannot be empty');
            await expect(Apify.getValue(null)).to.be.rejectedWith('Parameter "key" of type String must be provided');
        });

        it('throws if APIFY_DEFAULT_KEY_VALUE_STORE_ID env var is not defined', async () => {
            const errMsg = 'The \'APIFY_DEFAULT_KEY_VALUE_STORE_ID\' environment variable is not defined';

            process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID] = '';
            await expect(Apify.getValue('KEY')).to.be.rejectedWith(errMsg);

            delete process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID];
            await expect(Apify.getValue('some other key')).to.be.rejectedWith(errMsg);
        });
    });

    describe('setValue', async () => {
        it('throws on invalid args', async () => {
            process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID] = '1234';
            await expect(Apify.setValue()).to.be.rejectedWith('Parameter "key" of type String must be provided');
            await expect(Apify.setValue('', null)).to.be.rejectedWith('The "key" parameter cannot be empty');
            await expect(Apify.setValue('', 'some value')).to.be.rejectedWith('The "key" parameter cannot be empty');
            await expect(Apify.setValue({}, 'some value')).to.be.rejectedWith('Parameter "key" of type String must be provided');
            await expect(Apify.setValue(123, 'some value')).to.be.rejectedWith('Parameter "key" of type String must be provided');

            const valueErrMsg = 'The "value" parameter must be a String or Buffer when "options.contentType" is specified';
            await expect(Apify.setValue('key', {}, { contentType: 'image/png' })).to.be.rejectedWith(valueErrMsg);
            await expect(Apify.setValue('key', 12345, { contentType: 'image/png' })).to.be.rejectedWith(valueErrMsg);
            await expect(Apify.setValue('key', () => {}, { contentType: 'image/png' })).to.be.rejectedWith(valueErrMsg);

            const optsErrMsg = 'Parameter "options" of type Object must be provided';
            await expect(Apify.setValue('key', {}, 123)).to.be.rejectedWith(optsErrMsg);
            await expect(Apify.setValue('key', {}, 'bla/bla')).to.be.rejectedWith(optsErrMsg);
            await expect(Apify.setValue('key', {}, true)).to.be.rejectedWith(optsErrMsg);

            const circularObj = {};
            circularObj.xxx = circularObj;
            const jsonErrMsg = 'The "value" parameter cannot be stringified to JSON';
            await expect(Apify.setValue('key', circularObj)).to.be.rejectedWith(jsonErrMsg);
            await expect(Apify.setValue('key', undefined)).to.be.rejectedWith(jsonErrMsg);
            await expect(Apify.setValue('key', () => {})).to.be.rejectedWith(jsonErrMsg);
            await expect(Apify.setValue('key')).to.be.rejectedWith(jsonErrMsg);

            const contTypeRedundantErrMsg = 'The "options.contentType" parameter must not be used when removing the record';
            await expect(Apify.setValue('key', null, { contentType: 'image/png' })).to.be.rejectedWith(contTypeRedundantErrMsg);
            await expect(Apify.setValue('key', null, { contentType: '' })).to.be.rejectedWith(contTypeRedundantErrMsg);
            await expect(Apify.setValue('key', null, { contentType: {} }))
                .to.be.rejectedWith('Parameter "options.contentType" of type String | Null | Undefined must be provided');

            const contTypeStringErrMsg = 'Parameter "options.contentType" of type String | Null | Undefined must be provided';
            await expect(Apify.setValue('key', 'value', { contentType: 123 })).to.be.rejectedWith(contTypeStringErrMsg);
            await expect(Apify.setValue('key', 'value', { contentType: {} })).to.be.rejectedWith(contTypeStringErrMsg);
            await expect(Apify.setValue('key', 'value', { contentType: new Date() })).to.be.rejectedWith(contTypeStringErrMsg);
            await expect(Apify.setValue('key', 'value', { contentType: '' }))
                .to.be.rejectedWith('Parameter options.contentType cannot be empty string.');
        });

        it('throws if APIFY_DEFAULT_KEY_VALUE_STORE_ID env var is not defined', async () => {
            const errMsg = 'The \'APIFY_DEFAULT_KEY_VALUE_STORE_ID\' environment variable is not defined';

            process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID] = '';
            await expect(Apify.setValue('KEY', {})).to.be.rejectedWith(errMsg);

            delete process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID];
            await expect(Apify.setValue('some other key', {})).to.be.rejectedWith(errMsg);
        });

        it('correctly adds charset to content type', async () => {
            const store = new KeyValueStore('some-id-1');
            const mock = sinon.mock(apifyClient.keyValueStores);

            mock.expects('putRecord')
                .once()
                .withArgs({
                    storeId: 'some-id-1',
                    key: 'key-1',
                    body: 'xxxx',
                    contentType: 'text/plain; charset=utf-8',
                })
                .returns(Promise.resolve(null));
            await store.setValue('key-1', 'xxxx', { contentType: 'text/plain' });
            mock.verify();
            mock.restore();
        });

        it('correctly passes object values as JSON', async () => {
            const store = new KeyValueStore('some-id-1');
            const mock = sinon.mock(apifyClient.keyValueStores);
            const record = { foo: 'bar' };
            const recordStr = JSON.stringify(record, null, 2);

            mock.expects('putRecord')
                .once()
                .withArgs({
                    storeId: 'some-id-1',
                    key: 'key-1',
                    body: recordStr,
                    contentType: 'application/json; charset=utf-8',
                })
                .returns(Promise.resolve(null));
            await store.setValue('key-1', record);
            mock.verify();
            mock.restore();
        });

        it('correctly passes raw string values', async () => {
            const store = new KeyValueStore('some-id-1');
            const mock = sinon.mock(apifyClient.keyValueStores);

            mock.expects('putRecord')
                .once()
                .withArgs({
                    storeId: 'some-id-1',
                    key: 'key-1',
                    body: 'xxxx',
                    contentType: 'text/plain; charset=utf-8',
                })
                .returns(Promise.resolve(null));
            await store.setValue('key-1', 'xxxx', { contentType: 'text/plain; charset=utf-8' });
            mock.verify();
            mock.restore();
        });

        it('correctly passes raw Buffer values', async () => {
            const store = new KeyValueStore('some-id-1');
            const mock = sinon.mock(apifyClient.keyValueStores);
            const value = Buffer.from('some text value');

            mock.expects('putRecord')
                .once()
                .withArgs({
                    storeId: 'some-id-1',
                    key: 'key-1',
                    body: value,
                    contentType: 'image/jpeg; charset=something',
                })
                .returns(Promise.resolve(null));
            await store.setValue('key-1', value, { contentType: 'image/jpeg; charset=something' });
            mock.verify();
            mock.restore();
        });
    });
});
