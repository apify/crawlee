// Regression guard for https://github.com/apify/crawlee/issues/1732 and
// https://github.com/apify/crawlee/issues/1710 — storing a large binary value must not crash (the old
// pure-TS implementation overflowed the stack on big buffers). The native client does the actual
// write; the adapter passes a `Buffer` straight through. Here we verify a large buffer round-trips
// through `setValue` / `getValue` via the public API.

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageClient } from '@crawlee/fs-storage';
import type { KeyValueStoreClient } from '@crawlee/types';

describe('KeyValueStore round-trips a large binary value', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/no-buffer-crash');
    const storage = new FileSystemStorageClient({ localDataDirectory: tmpLocation });

    let store: KeyValueStoreClient;

    beforeAll(async () => {
        store = await storage.createKeyValueStoreClient();
    });

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('stores and reads back a large buffer without crashing', async () => {
        const size = process.env.CRAWLEE_DIFFICULT_TESTS ? 50_000_000 : 1_000_000;
        const zip = Buffer.alloc(size);
        // Fill with a non-trivial, verifiable pattern.
        for (let i = 0; i < size; i += 1) {
            zip[i] = i % 256;
        }

        await store.setValue({ key: 'owo.zip', value: zip, contentType: 'application/zip' });

        const record = await store.getValue('owo.zip');
        expect(Buffer.isBuffer(record?.value)).toBe(true);
        expect((record!.value as Buffer).length).toBe(size);
        expect(record!.value.equals(zip)).toBe(true);
    });
});
