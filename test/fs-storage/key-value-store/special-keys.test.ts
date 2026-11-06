import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';

// Keys may contain characters that are unsafe in a file name (e.g. `.` or `/`). The adapter must
// round-trip such keys correctly through `setValue` / `getValue` / `listKeys` regardless of how the
// underlying native client encodes them on disk. The concrete on-disk filenames are the native
// client's concern and are not asserted here.
//
// The resource client is a plain byte transport — value serialization/parsing lives in the
// `KeyValueStore` frontend codec, not here. These tests therefore pass already-serialized bytes in
// and expect raw bytes back out, exercising only what this layer is responsible for.
describe('KeyValueStore handles keys with file-name-unsafe characters', () => {
    const tmpLocation = resolve(import.meta.dirname, '../tmp/special-keys');

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('round-trips a key containing a dot', async () => {
        const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation });
        const store = await storage.createKeyValueStoreBackend({ name: 'dotted' });

        const body = '<html lang="en"><body>Hi there!</body></html>';
        await store.setValue({
            key: 'jibberish2.html',
            value: body,
            contentType: 'text/html',
        });

        const record = await store.getValue('jibberish2.html');
        expect(record?.value).toStrictEqual(Buffer.from(body));
        expect(record?.contentType).toBe('text/html');

        expect(await store.recordExists('jibberish2.html')).toBe(true);
        const { items } = await store.listKeys();
        expect(items.map((item) => item.key)).toContain('jibberish2.html');
    });

    test('round-trips a key containing a slash', async () => {
        const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation });
        const store = await storage.createKeyValueStoreBackend({ name: 'slashed' });

        const body = JSON.stringify({ ok: true });
        await store.setValue({ key: 'nested/key', value: body, contentType: 'application/json; charset=utf-8' });

        const record = await store.getValue('nested/key');
        expect(record?.value).toStrictEqual(Buffer.from(body));

        expect(await store.recordExists('nested/key')).toBe(true);
        const { items } = await store.listKeys();
        expect(items.map((item) => item.key)).toContain('nested/key');
    });
});
