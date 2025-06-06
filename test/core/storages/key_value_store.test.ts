import { PassThrough } from 'node:stream';

import { Configuration, KeyValueStore, maybeStringify } from '@crawlee/core';
import type { Dictionary } from '@crawlee/utils';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

const localStorageEmulator = new MemoryStorageEmulator();

beforeEach(async () => {
    await localStorageEmulator.init();
});

afterAll(async () => {
    await localStorageEmulator.destroy();
});

describe('KeyValueStore', () => {
    const client = Configuration.getStorageClient();

    beforeEach(async () => {
        vitest.clearAllMocks();
    });

    test('should work', async () => {
        const store = new KeyValueStore({
            id: 'some-id-1',
            client,
        });

        // Record definition
        const record = { foo: 'bar' };
        const recordStr = JSON.stringify(record, null, 2);

        // Set record
        const mockSetRecord = vitest
            // @ts-expect-error Accessing private property
            .spyOn(store.client, 'setRecord')
            .mockResolvedValueOnce(undefined);

        await store.setValue('key-1', record);

        expect(mockSetRecord).toBeCalledTimes(1);
        expect(mockSetRecord).toBeCalledWith(
            {
                key: 'key-1',
                value: recordStr,
                contentType: 'application/json; charset=utf-8',
            },
            {
                doNotRetryTimeouts: undefined,
                timeoutSecs: undefined,
            },
        );

        // Get Record
        const mockGetRecord = vitest
            // @ts-expect-error Accessing private property
            .spyOn(store.client, 'getRecord')
            .mockResolvedValueOnce({
                key: 'key-1',
                value: record,
                contentType: 'application/json; charset=utf-8',
            });

        const response = await store.getValue('key-1');

        expect(mockGetRecord).toBeCalledTimes(1);
        expect(mockGetRecord).toBeCalledWith('key-1');
        expect(response).toEqual(record);

        // Record Exists
        const mockRecordExists = vitest
            // @ts-expect-error Accessing private property
            .spyOn(store.client, 'recordExists')
            .mockResolvedValueOnce(true);

        const exists = await store.recordExists('key-1');

        expect(mockRecordExists).toBeCalledTimes(1);
        expect(mockRecordExists).toBeCalledWith('key-1');
        expect(exists).toBe(true);

        // Delete Record
        const mockDeleteRecord = vitest
            // @ts-expect-error Accessing private property
            .spyOn(store.client, 'deleteRecord')
            .mockResolvedValueOnce(undefined);

        await store.setValue('key-1', null);

        expect(mockDeleteRecord).toBeCalledTimes(1);
        expect(mockDeleteRecord).toBeCalledWith('key-1');

        // Drop store
        const mockDelete = vitest
            // @ts-expect-error Accessing private property
            .spyOn(store.client, 'delete')
            .mockResolvedValueOnce(undefined);

        await store.drop();

        expect(mockDelete).toBeCalledTimes(1);
        expect(mockDelete).toHaveBeenLastCalledWith();
    });

    describe('getValue', () => {
        test('throws on invalid args', async () => {
            const store = new KeyValueStore({
                id: 'some-id-1',
                client,
            });

            // @ts-expect-error JS-side validation
            await expect(store.getValue()).rejects.toThrow(
                'Expected argument to be of type `string` but received type `undefined`',
            );
            // @ts-expect-error JS-side validation
            await expect(store.getValue({})).rejects.toThrow(
                'Expected argument to be of type `string` but received type `Object`',
            );
            // @ts-expect-error JS-side validation
            await expect(store.getValue(null)).rejects.toThrow(
                'Expected argument to be of type `string` but received type `null`',
            );
            await expect(store.getValue('')).rejects.toThrow('Expected string to not be empty');
        });

        test('KeyValueStore.getValue()', async () => {
            const getValueSpy = vitest.spyOn(KeyValueStore.prototype, 'getValue');
            getValueSpy.mockImplementationOnce(async () => 123);

            const val = await KeyValueStore.getValue('key-1');
            expect(getValueSpy).toBeCalledTimes(1);
            expect(getValueSpy).toBeCalledWith('key-1', undefined);
            expect(val).toBe(123);

            const val2 = await KeyValueStore.getValue('key-2', 321);
            expect(getValueSpy).toBeCalledTimes(2);
            expect(getValueSpy).toBeCalledWith('key-2', 321);
            expect(val2).toBe(321);
        });
    });

    describe('recordExists', () => {
        test('throws on invalid args', async () => {
            const store = new KeyValueStore({
                id: 'some-id-1',
                client,
            });

            // @ts-expect-error JS-side validation
            await expect(store.recordExists()).rejects.toThrow(
                'Expected argument to be of type `string` but received type `undefined`',
            );
            // @ts-expect-error JS-side validation
            await expect(store.recordExists({})).rejects.toThrow(
                'Expected argument to be of type `string` but received type `Object`',
            );
            // @ts-expect-error JS-side validation
            await expect(store.recordExists(null)).rejects.toThrow(
                'Expected argument to be of type `string` but received type `null`',
            );
            await expect(store.recordExists('')).rejects.toThrow('Expected string to not be empty');
        });

        test('KeyValueStore.recordExists()', async () => {
            const recordExistsSpy = vitest.spyOn(KeyValueStore.prototype, 'recordExists');
            recordExistsSpy.mockImplementationOnce(async () => false);

            const val = await KeyValueStore.recordExists('key-1');
            expect(recordExistsSpy).toBeCalledTimes(1);
            expect(recordExistsSpy).toBeCalledWith('key-1');
            expect(val).toBe(false);
        });
    });

    describe('setValue', () => {
        test('throws on invalid args', async () => {
            const store = new KeyValueStore({
                id: 'some-id-1',
                client,
            });

            // @ts-expect-error JS-side validation
            await expect(store.setValue()).rejects.toThrow(
                'Expected `key` to be of type `string` but received type `undefined`',
            );
            await expect(store.setValue('', null)).rejects.toThrow('Expected string `key` to not be empty');
            await expect(store.setValue('', 'some value')).rejects.toThrow('Expected string `key` to not be empty');
            // @ts-expect-error JS-side validation
            await expect(store.setValue({}, 'some value')).rejects.toThrow(
                'Expected `key` to be of type `string` but received type `Object`',
            );
            // @ts-expect-error JS-side validation
            await expect(store.setValue(123, 'some value')).rejects.toThrow(
                'Expected `key` to be of type `string` but received type `number`',
            );

            const valueErrMsg =
                'The "value" parameter must be a String, Buffer or Stream when "options.contentType" is specified';
            await expect(store.setValue('key', {}, { contentType: 'image/png' })).rejects.toThrow(valueErrMsg);
            await expect(store.setValue('key', 12345, { contentType: 'image/png' })).rejects.toThrow(valueErrMsg);
            await expect(store.setValue('key', () => {}, { contentType: 'image/png' })).rejects.toThrow(valueErrMsg);

            // @ts-expect-error JS-side validation
            await expect(store.setValue('key', {}, 123)).rejects.toThrow(
                'Expected argument to be of type `object` but received type `number`',
            );
            // @ts-expect-error JS-side validation
            await expect(store.setValue('key', {}, 'bla/bla')).rejects.toThrow(
                'Expected argument to be of type `object` but received type `string`',
            );
            // @ts-expect-error JS-side validation
            await expect(store.setValue('key', {}, true)).rejects.toThrow(
                'Expected argument to be of type `object` but received type `boolean`',
            );

            const circularObj = {} as Dictionary;
            circularObj.xxx = circularObj;
            const circularErrMsg =
                'The "value" parameter cannot be stringified to JSON: Converting circular structure to JSON';
            const undefinedErrMsg =
                'The "value" parameter was stringified to JSON and returned undefined. ' +
                "Make sure you're not trying to stringify an undefined value.";
            await expect(store.setValue('key', circularObj)).rejects.toThrow(circularErrMsg);
            await expect(store.setValue('key', undefined)).rejects.toThrow(undefinedErrMsg);
            // @ts-expect-error JS-side validation
            await expect(store.setValue('key')).rejects.toThrow(undefinedErrMsg);

            const contTypeRedundantErrMsg = 'Expected property string `contentType` to not be empty in object';
            await expect(store.setValue('key', null, { contentType: 'image/png' })).rejects.toThrow(
                'The "value" parameter must be a String, Buffer or Stream when "options.contentType" is specified.',
            );
            await expect(store.setValue('key', null, { contentType: '' })).rejects.toThrow(contTypeRedundantErrMsg);
            // @ts-expect-error Type '{}' is not assignable to type 'string'.
            await expect(store.setValue('key', null, { contentType: {} })).rejects.toThrow(
                'The "value" parameter must be a String, Buffer or Stream when "options.contentType" is specified.',
            );

            // @ts-expect-error Type 'number' is not assignable to type 'string'.
            await expect(store.setValue('key', 'value', { contentType: 123 })).rejects.toThrow(
                'Expected property `contentType` to be of type `string` but received type `number` in object',
            );
            // @ts-expect-error Type '{}' is not assignable to type 'string'.
            await expect(store.setValue('key', 'value', { contentType: {} })).rejects.toThrow(
                'Expected property `contentType` to be of type `string` but received type `Object` in object',
            );
            // @ts-expect-error Type 'Date' is not assignable to type 'string'.
            await expect(store.setValue('key', 'value', { contentType: new Date() })).rejects.toThrow(
                'Expected property `contentType` to be of type `string` but received type `Date` in object',
            );
            await expect(store.setValue('key', 'value', { contentType: '' })).rejects.toThrow(
                'Expected property string `contentType` to not be empty in object',
            );
        });

        test('throws on invalid key', async () => {
            const store = new KeyValueStore({
                id: 'my-store-id',
                client,
            });

            const INVALID_CHARACTERS = '?|\\/"*<>%:';
            for (const char of INVALID_CHARACTERS) {
                const key = `my_id_${char}`;
                const err = `The "key" argument "${key}" must be at most 256 characters`;
                await expect(store.setValue(key, 'value')).rejects.toThrow(err);
            }

            // test max length
            const longKey = 'X'.repeat(257);
            const err = `The "key" argument "${longKey}" must be at most 256 characters`;
            await expect(store.setValue(longKey, '...')).rejects.toThrow(err);
        });

        test('correctly adds charset to content type', async () => {
            const store = new KeyValueStore({
                id: 'my-store-id-1',
                client,
            });

            const mockSetRecord = vitest
                // @ts-expect-error Accessing private property
                .spyOn(store.client, 'setRecord')
                .mockResolvedValueOnce(undefined);

            await store.setValue('key-1', 'xxxx', { contentType: 'text/plain; charset=utf-8' });

            expect(mockSetRecord).toBeCalledTimes(1);
            expect(mockSetRecord).toBeCalledWith(
                {
                    key: 'key-1',
                    value: 'xxxx',
                    contentType: 'text/plain; charset=utf-8',
                },
                {
                    doNotRetryTimeouts: undefined,
                    timeoutSecs: undefined,
                },
            );
        });

        test('correctly passes object values as JSON', async () => {
            const store = new KeyValueStore({
                id: 'my-store-id-1',
                client,
            });

            const record = { foo: 'bar' };
            const recordStr = JSON.stringify(record, null, 2);

            const mockSetRecord = vitest
                // @ts-expect-error Accessing private property
                .spyOn(store.client, 'setRecord')
                .mockResolvedValueOnce(undefined);

            await store.setValue('key-1', record);

            expect(mockSetRecord).toBeCalledTimes(1);
            expect(mockSetRecord).toBeCalledWith(
                {
                    key: 'key-1',
                    value: recordStr,
                    contentType: 'application/json; charset=utf-8',
                },
                {
                    doNotRetryTimeouts: undefined,
                    timeoutSecs: undefined,
                },
            );
        });

        test('correctly passes timeout options', async () => {
            const store = new KeyValueStore({
                id: 'my-store-id-1',
                client,
            });

            const record = { foo: 'bar' };
            const recordStr = JSON.stringify(record, null, 2);

            const mockSetRecord = vitest
                // @ts-expect-error Accessing private property
                .spyOn(store.client, 'setRecord')
                .mockResolvedValueOnce(undefined);

            await store.setValue('key-1', record, {
                timeoutSecs: 1,
                doNotRetryTimeouts: true,
            });

            expect(mockSetRecord).toBeCalledTimes(1);
            expect(mockSetRecord).toBeCalledWith(
                {
                    key: 'key-1',
                    value: recordStr,
                    contentType: 'application/json; charset=utf-8',
                },
                {
                    doNotRetryTimeouts: true,
                    timeoutSecs: 1,
                },
            );
        });

        test('correctly passes raw string values', async () => {
            const store = new KeyValueStore({
                id: 'my-store-id-1',
                client,
            });

            const mockSetRecord = vitest
                // @ts-expect-error Accessing private property
                .spyOn(store.client, 'setRecord')
                .mockResolvedValueOnce(undefined);

            await store.setValue('key-1', 'xxxx', { contentType: 'text/plain; charset=utf-8' });

            expect(mockSetRecord).toBeCalledTimes(1);
            expect(mockSetRecord).toBeCalledWith(
                {
                    key: 'key-1',
                    value: 'xxxx',
                    contentType: 'text/plain; charset=utf-8',
                },
                {
                    doNotRetryTimeouts: undefined,
                    timeoutSecs: undefined,
                },
            );
        });

        test('correctly passes raw Buffer values', async () => {
            const store = new KeyValueStore({
                id: 'my-store-id-1',
                client,
            });

            const mockSetRecord = vitest
                // @ts-expect-error Accessing private property
                .spyOn(store.client, 'setRecord')
                .mockResolvedValueOnce(undefined);

            const value = Buffer.from('some text value');
            await store.setValue('key-1', value, { contentType: 'image/jpeg; charset=something' });

            expect(mockSetRecord).toBeCalledTimes(1);
            expect(mockSetRecord).toBeCalledWith(
                {
                    key: 'key-1',
                    value,
                    contentType: 'image/jpeg; charset=something',
                },
                {
                    doNotRetryTimeouts: undefined,
                    timeoutSecs: undefined,
                },
            );
        });

        test('correctly passes a stream', async () => {
            const store = new KeyValueStore({
                id: 'my-store-id-1',
                client,
            });

            const mockSetRecord = vitest
                // @ts-expect-error Accessing private property
                .spyOn(store.client, 'setRecord')
                .mockResolvedValueOnce(undefined);

            const value = new PassThrough();
            await store.setValue('key-1', value, { contentType: 'plain/text' });
            value.emit('data', 'hello world');
            value.end();
            value.destroy();

            expect(mockSetRecord).toHaveBeenCalledTimes(1);
            expect(mockSetRecord).toHaveBeenCalledWith(
                {
                    key: 'key-1',
                    value,
                    contentType: 'plain/text',
                },
                {
                    doNotRetryTimeouts: undefined,
                    timeoutSecs: undefined,
                },
            );
        });
    });

    // TODO move to actor sdk tests before splitting the repos
    // describe('getPublicUrl', () => {
    //     test('should return the url of a file in apify cloud', async () => {
    //         process.env[ENV_VARS.TOKEN] = 'xxx';
    //         const publicUrl = 'https://api.apify.com/v2/key-value-stores';
    //         const store = new KeyValueStore({
    //             id: 'my-store-id-1',
    //             client,
    //         });
    //
    //         await import('apify');
    //         const storeFromActorSdk = store as import('apify').KeyValueStore;
    //         expect(storeFromActorSdk.getPublicUrl('file')).toBe(`${publicUrl}/my-store-id-1/records/file`);
    //         delete process.env[ENV_VARS.TOKEN];
    //     });
    // });

    describe('maybeStringify()', () => {
        test('should work', () => {
            expect(maybeStringify({ foo: 'bar' }, { contentType: null as any })).toBe('{\n  "foo": "bar"\n}');
            expect(maybeStringify({ foo: 'bar' }, { contentType: undefined })).toBe('{\n  "foo": "bar"\n}');

            expect(maybeStringify('xxx', { contentType: undefined })).toBe('"xxx"');
            expect(maybeStringify('xxx', { contentType: 'something' })).toBe('xxx');

            const obj = {} as Dictionary;
            obj.self = obj;
            expect(() => maybeStringify(obj, { contentType: null as any })).toThrowError(
                'The "value" parameter cannot be stringified to JSON: Converting circular structure to JSON',
            );
        });
    });

    describe('getFileNameRegexp()', () => {
        const getFileNameRegexp = (key: string) => {
            const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`^${safeKey}\\.[a-z0-9]+$`);
        };

        test('should work', () => {
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
            expect(matched).toBe(3);
        });
    });

    describe('forEachKey', () => {
        test('should work with prefixes', async () => {
            const store = await KeyValueStore.open();

            for (const [key, value] of Object.entries({
                'img-key1': 'PAYLOAD',
                'img-key2': 'PAYLOAD',
                'txt-key1': 'PAYLOAD',
                'txt-key2': 'PAYLOAD',
            })) {
                await store.setValue(key, value);
            }

            const imgKeys: string[] = [];
            const txtKeys: string[] = [];

            await store.forEachKey(
                (key) => {
                    imgKeys.push(key);
                },
                { prefix: 'img-' },
            );

            await store.forEachKey(
                (key) => {
                    txtKeys.push(key);
                },
                { prefix: 'txt-' },
            );

            expect(imgKeys).toEqual(['img-key1', 'img-key2']);
            expect(txtKeys).toEqual(['txt-key1', 'txt-key2']);
        });

        test('should work remotely', async () => {
            const store = new KeyValueStore({
                id: 'my-store-id-1',
                client,
            });

            // @ts-expect-error Accessing private property
            const mockListKeys = vitest.spyOn(store.client, 'listKeys');
            mockListKeys.mockResolvedValueOnce({
                isTruncated: true,
                exclusiveStartKey: 'key0',
                nextExclusiveStartKey: 'key2',
                items: [
                    { key: 'key1', size: 1 },
                    { key: 'key2', size: 2 },
                ],
                count: 2,
                limit: 2,
            });

            mockListKeys.mockResolvedValueOnce({
                isTruncated: true,
                exclusiveStartKey: 'key0',
                nextExclusiveStartKey: 'key4',
                items: [
                    { key: 'key3', size: 3 },
                    { key: 'key4', size: 4 },
                ],
                count: 1,
                limit: 2,
            });

            mockListKeys.mockResolvedValueOnce({
                isTruncated: false,
                exclusiveStartKey: 'key0',
                nextExclusiveStartKey: undefined,
                items: [{ key: 'key5', size: 5 }],
                count: 1,
                limit: 1,
            });

            const results: [string, number, { size: number }][] = [];
            await store.forEachKey(
                async (key, index, info) => {
                    results.push([key, index, info]);
                },
                { exclusiveStartKey: 'key0', prefix: 'img/' },
            );

            expect(mockListKeys).toBeCalledTimes(3);
            expect(mockListKeys).toHaveBeenNthCalledWith(1, { exclusiveStartKey: 'key0', prefix: 'img/' });
            expect(mockListKeys).toHaveBeenNthCalledWith(2, { exclusiveStartKey: 'key2', prefix: 'img/' });
            expect(mockListKeys).toHaveBeenNthCalledWith(3, { exclusiveStartKey: 'key4', prefix: 'img/' });

            expect(results).toHaveLength(5);
            results.forEach((r, i) => {
                expect(r[2]).toEqual({ size: i + 1 });
                expect(r[1]).toEqual(i);
                expect(r[0]).toEqual(`key${i + 1}`);
            });
        });
    });
});
