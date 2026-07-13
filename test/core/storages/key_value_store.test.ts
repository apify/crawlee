import { PassThrough } from 'node:stream';

import { KeyValueStore, MemoryStorageBackend, serviceLocator } from '@crawlee/core';
import type { Dictionary } from '@crawlee/utils';
import { toBuffer } from '@crawlee/utils';

beforeEach(async () => {
    serviceLocator.setStorageBackend(new MemoryStorageBackend());
});

describe('KeyValueStore', () => {
    async function createKeyValueStore(id = 'some-id-1', name?: string) {
        const client = await serviceLocator.getStorageBackend().createKeyValueStoreBackend(name ? { name } : { id });
        return new KeyValueStore({ id, name, backend: client });
    }

    beforeEach(async () => {
        vitest.clearAllMocks();
    });

    test('should work', async () => {
        const store = await createKeyValueStore();

        // Record definition
        const record = { foo: 'bar' };
        const recordStr = JSON.stringify(record, null, 2);

        // Set record
        const mockSetValue = vitest
            // @ts-expect-error Accessing private property
            .spyOn(store.backend, 'setValue')
            .mockResolvedValueOnce(undefined);

        await store.setValue('key-1', record);

        expect(mockSetValue).toHaveBeenCalledTimes(1);
        expect(mockSetValue).toHaveBeenCalledWith({
            key: 'key-1',
            value: recordStr,
            contentType: 'application/json; charset=utf-8',
        });

        // Get Record
        const mockGetValue = vitest
            // @ts-expect-error Accessing private property
            .spyOn(store.backend, 'getValue')
            .mockResolvedValueOnce({
                key: 'key-1',
                // The client now returns raw bytes; the frontend parses them.
                value: Buffer.from(recordStr),
                contentType: 'application/json; charset=utf-8',
            });

        const response = await store.getValue('key-1');

        expect(mockGetValue).toHaveBeenCalledTimes(1);
        expect(mockGetValue).toHaveBeenCalledWith('key-1');
        expect(response).toEqual(record);

        // Record Exists
        const mockRecordExists = vitest
            // @ts-expect-error Accessing private property
            .spyOn(store.backend, 'recordExists')
            .mockResolvedValueOnce(true);

        const exists = await store.recordExists('key-1');

        expect(mockRecordExists).toHaveBeenCalledTimes(1);
        expect(mockRecordExists).toHaveBeenCalledWith('key-1');
        expect(exists).toBe(true);

        // Delete Record
        const mockDeleteValue = vitest
            // @ts-expect-error Accessing private property
            .spyOn(store.backend, 'deleteValue')
            .mockResolvedValueOnce(undefined);

        await store.setValue('key-1', null);

        expect(mockDeleteValue).toHaveBeenCalledTimes(1);
        expect(mockDeleteValue).toHaveBeenCalledWith('key-1');

        // Drop store
        const mockDrop = vitest
            // @ts-expect-error Accessing private property
            .spyOn(store.backend, 'drop')
            .mockResolvedValueOnce(undefined);

        await store.drop();

        expect(mockDrop).toHaveBeenCalledTimes(1);
        expect(mockDrop).toHaveBeenLastCalledWith();
    });

    describe('getValue', () => {
        test('throws on invalid args', async () => {
            const store = await createKeyValueStore();

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
            expect(getValueSpy).toHaveBeenCalledTimes(1);
            expect(getValueSpy).toHaveBeenCalledWith('key-1', undefined);
            expect(val).toBe(123);

            const val2 = await KeyValueStore.getValue('key-2', 321);
            expect(getValueSpy).toHaveBeenCalledTimes(2);
            expect(getValueSpy).toHaveBeenCalledWith('key-2', 321);
            expect(val2).toBe(321);
        });
    });

    describe('recordExists', () => {
        test('throws on invalid args', async () => {
            const store = await createKeyValueStore();

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
            expect(recordExistsSpy).toHaveBeenCalledTimes(1);
            expect(recordExistsSpy).toHaveBeenCalledWith('key-1');
            expect(val).toBe(false);
        });
    });

    describe('setValue', () => {
        test('throws on invalid args', async () => {
            const store = await createKeyValueStore();

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
                'The "value" parameter must be a String, Buffer, ArrayBuffer, TypedArray, or Stream when "options.contentType" is specified';
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
                'The "value" parameter must be a String, Buffer, ArrayBuffer, TypedArray, or Stream when "options.contentType" is specified.',
            );
            await expect(store.setValue('key', null, { contentType: '' })).rejects.toThrow(contTypeRedundantErrMsg);
            // @ts-expect-error Type '{}' is not assignable to type 'string'.
            await expect(store.setValue('key', null, { contentType: {} })).rejects.toThrow(
                'The "value" parameter must be a String, Buffer, ArrayBuffer, TypedArray, or Stream when "options.contentType" is specified.',
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
            const store = await createKeyValueStore('my-store-id');

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
            const store = await createKeyValueStore('my-store-id-1');

            const mockSetValue = vitest
                // @ts-expect-error Accessing private property
                .spyOn(store.backend, 'setValue')
                .mockResolvedValueOnce(undefined);

            await store.setValue('key-1', 'xxxx', { contentType: 'text/plain; charset=utf-8' });

            expect(mockSetValue).toHaveBeenCalledTimes(1);
            expect(mockSetValue).toHaveBeenCalledWith({
                key: 'key-1',
                value: 'xxxx',
                contentType: 'text/plain; charset=utf-8',
            });
        });

        test('correctly passes object values as JSON', async () => {
            const store = await createKeyValueStore('my-store-id-1');

            const record = { foo: 'bar' };
            const recordStr = JSON.stringify(record, null, 2);

            const mockSetValue = vitest
                // @ts-expect-error Accessing private property
                .spyOn(store.backend, 'setValue')
                .mockResolvedValueOnce(undefined);

            await store.setValue('key-1', record);

            expect(mockSetValue).toHaveBeenCalledTimes(1);
            expect(mockSetValue).toHaveBeenCalledWith({
                key: 'key-1',
                value: recordStr,
                contentType: 'application/json; charset=utf-8',
            });
        });

        test('correctly passes raw string values', async () => {
            const store = await createKeyValueStore('my-store-id-1');

            const mockSetValue = vitest
                // @ts-expect-error Accessing private property
                .spyOn(store.backend, 'setValue')
                .mockResolvedValueOnce(undefined);

            await store.setValue('key-1', 'xxxx', { contentType: 'text/plain; charset=utf-8' });

            expect(mockSetValue).toHaveBeenCalledTimes(1);
            expect(mockSetValue).toHaveBeenCalledWith({
                key: 'key-1',
                value: 'xxxx',
                contentType: 'text/plain; charset=utf-8',
            });
        });

        test('correctly passes raw Buffer values', async () => {
            const store = await createKeyValueStore('my-store-id-1');

            const mockSetValue = vitest
                // @ts-expect-error Accessing private property
                .spyOn(store.backend, 'setValue')
                .mockResolvedValueOnce(undefined);

            const value = Buffer.from('some text value');
            await store.setValue('key-1', value, { contentType: 'image/jpeg; charset=something' });

            expect(mockSetValue).toHaveBeenCalledTimes(1);
            expect(mockSetValue).toHaveBeenCalledWith({
                key: 'key-1',
                value,
                contentType: 'image/jpeg; charset=something',
            });
        });

        test('correctly passes a stream', async () => {
            const store = await createKeyValueStore('my-store-id-1');

            const mockSetValue = vitest
                // @ts-expect-error Accessing private property
                .spyOn(store.backend, 'setValue')
                .mockResolvedValueOnce(undefined);

            const value = new PassThrough();
            await store.setValue('key-1', value, { contentType: 'plain/text' });
            value.emit('data', 'hello world');
            value.end();
            value.destroy();

            expect(mockSetValue).toHaveBeenCalledTimes(1);
            expect(mockSetValue).toHaveBeenCalledWith({
                key: 'key-1',
                value,
                contentType: 'plain/text',
            });
        });
    });

    describe('round-trips through the real storage backend (no content type)', () => {
        test('object: setValue → getValue returns the same object, stored as application/json', async () => {
            const store = await KeyValueStore.open();
            const original = { foo: 'bar', n: 1 };
            await store.setValue('obj', original);

            await expect(store.getValue('obj')).resolves.toEqual(original);
            const record = await store.getRecord('obj');
            expect(record!.contentType).toBe('application/json; charset=utf-8');
        });

        test('string: setValue → getValue returns the same string, stored as text/plain (not JSON-wrapped)', async () => {
            const store = await KeyValueStore.open();
            await store.setValue('str', 'hello world');

            await expect(store.getValue('str')).resolves.toBe('hello world');
            const record = await store.getRecord('str');
            expect(record!.contentType).toBe('text/plain; charset=utf-8');
            // Bytes are the raw string, not the JSON-wrapped `'"hello world"'` the old code produced.
            expect(record!.value.toString()).toBe('hello world');
        });

        test('Buffer: setValue → getValue returns the same Buffer, stored as octet-stream (not JSON-mangled)', async () => {
            const store = await KeyValueStore.open();
            const original = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
            await store.setValue('buf', original);

            const value = await store.getValue('buf');
            expect(Buffer.isBuffer(value)).toBe(true);
            expect((value as Buffer).equals(original)).toBe(true);

            const record = await store.getRecord('buf');
            expect(record!.contentType).toBe('application/octet-stream');
            expect(toBuffer(record!.value).equals(original)).toBe(true);
        });
    });

    describe('pre-serialized JSON via setValue (caller owns the bytes)', () => {
        test('Buffer containing JSON + explicit application/json CT round-trips as a parsed object', async () => {
            const store = await KeyValueStore.open();
            const original = { foo: 'bar', n: 1 };
            const preSerialized = Buffer.from(JSON.stringify(original));

            await store.setValue('k', preSerialized, { contentType: 'application/json; charset=utf-8' });

            // getValue parses the bytes back into the original object.
            expect(await store.getValue('k')).toEqual(original);
        });

        test('string containing JSON + explicit application/json CT round-trips as a parsed object', async () => {
            const store = await KeyValueStore.open();
            const original = [1, 2, 3];

            await store.setValue('k', JSON.stringify(original), {
                contentType: 'application/json; charset=utf-8',
            });

            expect(await store.getValue('k')).toEqual(original);
        });
    });

    describe('getRecord', () => {
        test('returns null for a missing key', async () => {
            const store = await KeyValueStore.open();
            expect(await store.getRecord('missing')).toBeNull();
        });

        test('returns raw bytes + content type without parsing JSON', async () => {
            const store = await KeyValueStore.open();
            const original = { foo: 'bar', n: 1 };
            await store.setValue('obj', original);

            const record = await store.getRecord('obj');
            expect(record).not.toBeNull();
            expect(record!.contentType).toMatch(/^application\/json/);
            // Bytes are the serialized JSON, not the parsed object — the caller does the parsing.
            const asText = toBuffer(record!.value).toString('utf-8');
            expect(JSON.parse(asText)).toEqual(original);
        });

        test('returns the exact bytes a caller wrote with an explicit content type', async () => {
            const store = await KeyValueStore.open();
            const preSerialized = Buffer.from(JSON.stringify({ a: 1 }));

            await store.setValue('k', preSerialized, { contentType: 'application/json; charset=utf-8' });

            const record = await store.getRecord('k');
            expect(record).not.toBeNull();
            expect(record!.contentType).toBe('application/json; charset=utf-8');
            const asText = toBuffer(record!.value).toString('utf-8');
            expect(asText).toBe(preSerialized.toString());
        });

        test('returns a Buffer for octet-stream records', async () => {
            const store = await KeyValueStore.open();
            const original = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
            await store.setValue('buf', original);

            const record = await store.getRecord('buf');
            expect(record).not.toBeNull();
            expect(record!.contentType).toBe('application/octet-stream');
            expect(Buffer.isBuffer(record!.value)).toBe(true);
            expect((record!.value as Buffer).equals(original)).toBe(true);
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
            const store = await createKeyValueStore('my-store-id-1');

            // @ts-expect-error Accessing private property
            const mockListKeys = vitest.spyOn(store.backend, 'listKeys');
            mockListKeys.mockResolvedValueOnce({
                items: [
                    { key: 'key1', size: 1, contentType: 'application/octet-stream' },
                    { key: 'key2', size: 2, contentType: 'application/octet-stream' },
                    { key: 'key3', size: 3, contentType: 'application/octet-stream' },
                    { key: 'key4', size: 4, contentType: 'application/octet-stream' },
                    { key: 'key5', size: 5, contentType: 'application/octet-stream' },
                ],
                count: 5,
                limit: 5,
                isTruncated: false,
            });

            const results: [string, number, { size: number }][] = [];
            await store.forEachKey(
                async (key, index, info) => {
                    results.push([key, index, info]);
                },
                { prefix: 'img/' },
            );

            expect(mockListKeys).toHaveBeenCalledTimes(1);

            expect(results).toHaveLength(5);
            results.forEach((r, i) => {
                expect(r[2]).toEqual({ size: i + 1 });
                expect(r[1]).toEqual(i);
                expect(r[0]).toEqual(`key${i + 1}`);
            });
        });
    });

    describe('async iterators', () => {
        test('keys() should iterate over all keys', async () => {
            const store = await KeyValueStore.open();

            const testData = {
                key1: { value: 1 },
                key2: { value: 2 },
                key3: { value: 3 },
            };

            for (const [key, value] of Object.entries(testData)) {
                await store.setValue(key, value);
            }

            const keys: string[] = [];
            for await (const key of store.keys()) {
                keys.push(key);
            }

            expect(keys).toEqual(['key1', 'key2', 'key3']);
        });

        test('keys() should respect prefix option', async () => {
            const store = await KeyValueStore.open();

            for (const [key, value] of Object.entries({
                'img-key1': 'PAYLOAD',
                'img-key2': 'PAYLOAD',
                'txt-key1': 'PAYLOAD',
            })) {
                await store.setValue(key, value);
            }

            const imgKeys: string[] = [];
            for await (const key of store.keys({ prefix: 'img-' })) {
                imgKeys.push(key);
            }

            expect(imgKeys).toEqual(['img-key1', 'img-key2']);
        });

        test('values() should iterate over all values', async () => {
            const store = await KeyValueStore.open();

            const testData = {
                key1: { value: 1 },
                key2: { value: 2 },
                key3: { value: 3 },
            };

            for (const [key, value] of Object.entries(testData)) {
                await store.setValue(key, value);
            }

            const values: { value: number }[] = [];
            for await (const value of store.values<{ value: number }>()) {
                values.push(value);
            }

            expect(values).toEqual([{ value: 1 }, { value: 2 }, { value: 3 }]);
        });

        test('entries() should iterate over all key-value pairs', async () => {
            const store = await KeyValueStore.open();

            const testData = {
                key1: { value: 1 },
                key2: { value: 2 },
                key3: { value: 3 },
            };

            for (const [key, value] of Object.entries(testData)) {
                await store.setValue(key, value);
            }

            const entries: [string, { value: number }][] = [];
            for await (const [key, value] of store.entries<{ value: number }>()) {
                entries.push([key, value]);
            }

            expect(entries).toEqual([
                ['key1', { value: 1 }],
                ['key2', { value: 2 }],
                ['key3', { value: 3 }],
            ]);
        });

        test('Symbol.asyncIterator should iterate over entries', async () => {
            const store = await KeyValueStore.open();

            const testData = {
                key1: { value: 1 },
                key2: { value: 2 },
            };

            for (const [key, value] of Object.entries(testData)) {
                await store.setValue(key, value);
            }

            const entries: [string, { value: number }][] = [];
            for await (const [key, value] of store) {
                entries.push([key, value as { value: number }]);
            }

            expect(entries).toEqual([
                ['key1', { value: 1 }],
                ['key2', { value: 2 }],
            ]);
        });

        test('await keys() should return all keys as a flat array', async () => {
            const store = await KeyValueStore.open();

            const testData = {
                key1: { value: 1 },
                key2: { value: 2 },
                key3: { value: 3 },
            };

            for (const [key, value] of Object.entries(testData)) {
                await store.setValue(key, value);
            }

            const keys = await store.keys();

            expect(keys).toEqual(['key1', 'key2', 'key3']);
        });

        test('await values() should return all values as a flat array', async () => {
            const store = await KeyValueStore.open();

            const testData = {
                key1: { value: 1 },
                key2: { value: 2 },
                key3: { value: 3 },
            };

            for (const [key, value] of Object.entries(testData)) {
                await store.setValue(key, value);
            }

            const values = await store.values<{ value: number }>();

            expect(values).toEqual([{ value: 1 }, { value: 2 }, { value: 3 }]);
        });

        test('await entries() should return all entries as a flat array', async () => {
            const store = await KeyValueStore.open();

            const testData = {
                key1: { value: 1 },
                key2: { value: 2 },
                key3: { value: 3 },
            };

            for (const [key, value] of Object.entries(testData)) {
                await store.setValue(key, value);
            }

            const entries = await store.entries<{ value: number }>();

            expect(entries).toEqual([
                ['key1', { value: 1 }],
                ['key2', { value: 2 }],
                ['key3', { value: 3 }],
            ]);
        });
    });

    describe('stats', () => {
        test('start at zero', async () => {
            const store = await createKeyValueStore();
            expect(store.stats).toEqual({ readCount: 0, writeCount: 0, deleteCount: 0, listCount: 0 });
        });

        test('count reads, writes and deletes per client call', async () => {
            const store = await createKeyValueStore();

            await store.setValue('foo', { a: 1 });
            await store.setValue('bar', { b: 2 });
            expect(store.stats).toMatchObject({ writeCount: 2, readCount: 0, deleteCount: 0 });

            await store.getValue('foo');
            expect(store.stats).toMatchObject({ writeCount: 2, readCount: 1 });

            // Setting a value to null deletes it.
            await store.setValue('bar', null);
            expect(store.stats).toMatchObject({ writeCount: 2, deleteCount: 1 });
        });

        test('count list operations when iterating keys', async () => {
            const store = await createKeyValueStore();

            await store.setValue('key1', { value: 1 });
            await store.setValue('key2', { value: 2 });

            const listCountBefore = store.stats.listCount;
            await store.forEachKey(() => {});

            expect(store.stats.listCount).toBeGreaterThan(listCountBefore);
        });
    });
});
