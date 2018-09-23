import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'babel-polyfill';
import sinon from 'sinon';
import path from 'path';
import { ENV_VARS } from 'apify-shared/consts';
import { KeyValueStoreLocal, KeyValueStore, maybeStringify, getFileNameRegexp, LOCAL_STORAGE_SUBDIR } from '../build/key_value_store';
import * as utils from '../build/utils';
import * as Apify from '../build/index';
import { LOCAL_STORAGE_DIR, emptyLocalStorageSubdir, expectDirEmpty, expectDirNonEmpty } from './_helper';

const { apifyClient } = utils;

chai.use(chaiAsPromised);

describe('KeyValueStore', () => {
    before(() => apifyClient.setOptions({ token: 'xxx' }));
    after(() => apifyClient.setOptions({ token: undefined }));
    beforeEach(() => emptyLocalStorageSubdir(LOCAL_STORAGE_SUBDIR));
    afterEach(() => emptyLocalStorageSubdir(LOCAL_STORAGE_SUBDIR));

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

    describe('getFileNameRegexp()', () => {
        it('should work', () => {
            const key = 'hel.lo';
            const filenames = [
                'hel.lo.txt', // valid
                'hel.lo.hello.txt',
                'hel.lo.mp3', // valid
                'hel.lo....',
                'hel.lo.hello', // valid
                'hello.hel.lo',
                'hel.lo.',
                '.hel.lo',
                'hel.lo',
                'helXlo.bin',
            ];
            const matched = filenames.reduce((count, name) => (getFileNameRegexp(key).test(name) ? ++count : count), 0);
            expect(matched).to.be.eql(3);
        });
    });

    describe('local', async () => {
        it('should work', async () => {
            const store = new KeyValueStoreLocal('my-store-id', LOCAL_STORAGE_DIR);
            const store2 = new KeyValueStoreLocal('another-store-id', LOCAL_STORAGE_DIR);
            const buffer = Buffer.from('some text value');

            await store.setValue('key-obj', { foo: 'bar' });
            await store.setValue('key-string', 'xxxx', { contentType: 'text/plain' });
            await store.setValue('key-buffer', buffer, { contentType: 'image/jpeg' });
            await store2.setValue('key-obj', { foo: 'hotel' });
            await store2.setValue('key-string', 'yyyy', { contentType: 'text/plain' });
            await store2.setValue('key-ctype', buffer, { contentType: 'video/mp4' });
            await store2.setValue('key-badctype', buffer, { contentType: 'nonexistent/content-type' });

            // Try to read store2/key-string.
            expect(await store2.getValue('key-string')).to.be.eql('yyyy');

            // Try to delete store2/key-string with an error.
            try {
                await store2.setValue('key-string', null, { contentType: 'text/plain' });
                throw new Error('This should throw!!!');
            } catch (err) {
                expect(err).to.be.an('error');
                expect(err.message).not.to.include('This should throw!!!');
            }

            // Check that it still exists.
            expect(await store2.getValue('key-string')).to.be.eql('yyyy');

            // Try to delete store2/key-string again.
            await store2.setValue('key-string', null);

            // Check that it doesn't exist.
            expect(await store2.getValue('key-string')).to.be.eql(null);

            expect(await store.getValue('key-obj')).to.be.eql({ foo: 'bar' });
            expect(await store.getValue('key-string')).to.be.eql('xxxx');
            expect(await store.getValue('key-buffer')).to.be.eql(buffer);
            expect(await store.getValue('key-nonexist')).to.be.eql(null);
            expect(await store2.getValue('key-obj')).to.be.eql({ foo: 'hotel' });
            expect(await store2.getValue('key-ctype')).to.be.eql(buffer);
            expect(await store2.getValue('key-badctype')).to.be.eql(buffer);

            // Delete works.
            const storeDir = path.join(LOCAL_STORAGE_DIR, LOCAL_STORAGE_SUBDIR, 'my-store-id');
            expectDirNonEmpty(storeDir);
            await store.delete();
            expectDirEmpty(storeDir);
        });
    });

    describe('remote', async () => {
        it('works', async () => {
            const store = new KeyValueStore('some-id-1', 'some-name-1');
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
        it('should work', async () => {
            const mock = sinon.mock(utils);

            process.env[ENV_VARS.LOCAL_STORAGE_DIR] = LOCAL_STORAGE_DIR;

            mock.expects('openLocalStorage').once();
            await Apify.openKeyValueStore();

            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
            process.env[ENV_VARS.TOKEN] = 'xxx';

            mock.expects('openRemoteStorage').once();
            await Apify.openKeyValueStore();

            delete process.env[ENV_VARS.TOKEN];

            mock.verify();
            mock.restore();
        });
    });

    describe('getValue', async () => {
        it('throws on invalid args', async () => {
            process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID] = '1234';
            process.env[ENV_VARS.LOCAL_STORAGE_DIR] = LOCAL_STORAGE_DIR;
            await expect(Apify.getValue()).to.be.rejectedWith('Parameter "key" of type String must be provided');
            await expect(Apify.getValue({})).to.be.rejectedWith('Parameter "key" of type String must be provided');
            await expect(Apify.getValue('')).to.be.rejectedWith('The "key" parameter cannot be empty');
            await expect(Apify.getValue(null)).to.be.rejectedWith('Parameter "key" of type String must be provided');
            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
        });

        it('throws if APIFY_DEFAULT_KEY_VALUE_STORE_ID env var is not defined and we use cloud storage', async () => {
            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
            delete process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID];
            process.env[ENV_VARS.TOKEN] = 'xxx';

            const errMsg = 'The \'APIFY_DEFAULT_KEY_VALUE_STORE_ID\' environment variable is not defined';
            await expect(Apify.getValue('KEY')).to.be.rejectedWith(errMsg);

            delete process.env[ENV_VARS.TOKEN];
        });
    });

    describe('setValue', async () => {
        it('throws on invalid args', async () => {
            process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID] = '12345';
            process.env[ENV_VARS.LOCAL_STORAGE_DIR] = LOCAL_STORAGE_DIR;
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

            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
        });

        it('throws on invalid characters in key', async () => {
            const store = new KeyValueStoreLocal('my-store-id', LOCAL_STORAGE_DIR);
            const INVALID_CHARACTERS = '?|\\/"*<>%:';
            let counter = 0;

            for (const char of INVALID_CHARACTERS) { // eslint-disable-line
                try {
                    await store.setValue(`my_id_${char}`, 'value');
                } catch (err) {
                    if (err.message.match('The "key" parameter may contain only the following characters')) counter++;
                }
            }

            expect(counter).to.be.eql(INVALID_CHARACTERS.length);
        });

        it('throws if APIFY_DEFAULT_KEY_VALUE_STORE_ID env var is not defined and we use cloud storage', async () => {
            delete process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID];
            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
            process.env[ENV_VARS.TOKEN] = 'xxx';

            const errMsg = 'The \'APIFY_DEFAULT_KEY_VALUE_STORE_ID\' environment variable is not defined';
            await expect(Apify.setValue('KEY', {})).to.be.rejectedWith(errMsg);

            delete process.env[ENV_VARS.TOKEN];
        });

        it('correctly adds charset to content type', async () => {
            const store = new KeyValueStore('some-id-1', 'some-name-1');
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
            const store = new KeyValueStore('some-id-1', 'some-name-1');
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
            const store = new KeyValueStore('some-id-1', 'some-name-1');
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
            const store = new KeyValueStore('some-id-1', 'some-name-1');
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
