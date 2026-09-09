import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';
import type { KeyValueStoreRecord } from '@crawlee/types';

// A run may be pointed at a different input key than `INPUT` (Crawlee's `inputKey` / `CRAWLEE_INPUT_KEY`).
// The Apify CLI does exactly that: it writes the effective input to a bare `__CLI_INPUT.json` (no metadata
// sidecar) in the default store and sets the input key to `__CLI_INPUT`. That key must get the same
// out-of-band read fallback and purge exemption as `INPUT`, otherwise the input is unreadable — or
// deleted by the purge on start before the run ever reads it.
describe('the configured input key', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/configured-input-key');
    const inputKey = '__CLI_INPUT';
    const payload = JSON.stringify({ hello: 'from the cli' });

    const seedDefaultStore = async (storage: FileSystemStorageBackend, files: Record<string, string>) => {
        const dir = resolve(storage.keyValueStoresDirectory, 'default');
        await mkdir(dir, { recursive: true });
        for (const [file, content] of Object.entries(files)) {
            await writeFile(resolve(dir, file), content);
        }
    };

    afterEach(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('a bare <inputKey>.json is readable under the configured key', async () => {
        const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation, inputKey });
        await seedDefaultStore(storage, { [`${inputKey}.json`]: payload });

        const store = await storage.createKeyValueStoreBackend();

        expect(await store.getValue(inputKey)).toStrictEqual<KeyValueStoreRecord>({
            key: inputKey,
            value: Buffer.from(payload),
            contentType: 'application/json; charset=utf-8',
        });
        expect(await store.recordExists(inputKey)).toBe(true);
        expect(await store.getPublicUrl(inputKey)).toMatch(/\/__CLI_INPUT\.json$/);
    });

    test('a listed bare <inputKey>.json round-trips under its literal name', async () => {
        const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation, inputKey });
        await seedDefaultStore(storage, { [`${inputKey}.json`]: payload });

        const store = await storage.createKeyValueStoreBackend();
        const { items } = await store.listKeys();

        expect(items.map((item) => item.key)).toEqual([`${inputKey}.json`]);
        expect((await store.getValue(`${inputKey}.json`))?.value.toString()).toBe(payload);
        expect(await store.recordExists(`${inputKey}.json`)).toBe(true);
    });

    test('the same bare file is not readable when a different input key is configured', async () => {
        const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation });
        await seedDefaultStore(storage, { [`${inputKey}.json`]: payload });

        const store = await storage.createKeyValueStoreBackend();

        expect(await store.getValue(inputKey)).toBeUndefined();
        expect(await store.recordExists(inputKey)).toBe(false);
        expect((await store.listKeys()).items).toEqual([]);
    });

    test('purge keeps both the configured input key and INPUT in the default store', async () => {
        const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation, inputKey });
        await seedDefaultStore(storage, {
            [`${inputKey}.json`]: payload,
            'INPUT.json': JSON.stringify({ hello: 'from the user' }),
            'OUTPUT.json': JSON.stringify({ leftover: true }),
        });

        await storage.purge();

        const remaining = await readdir(resolve(storage.keyValueStoresDirectory, 'default'));
        expect(remaining.filter((file) => !file.startsWith('__metadata__')).sort()).toEqual([
            'INPUT.json',
            `${inputKey}.json`,
        ]);

        const store = await storage.createKeyValueStoreBackend();
        expect((await store.getValue(inputKey))?.value.toString()).toBe(payload);
        expect((await store.getValue('INPUT'))?.value.toString()).toBe(JSON.stringify({ hello: 'from the user' }));
    });

    test('purge does not keep the configured input key in a non-default alias store', async () => {
        const storage = new FileSystemStorageBackend({ localDataDirectory: tmpLocation, inputKey });
        const dir = resolve(storage.keyValueStoresDirectory, 'other');
        await mkdir(dir, { recursive: true });
        await writeFile(resolve(dir, `${inputKey}.json`), payload);
        await storage.createKeyValueStoreBackend({ alias: 'other' });

        await storage.purge();

        // Only the default store holds the run input; every other run-scoped store is swept clean.
        expect(await readdir(dir)).not.toContain(`${inputKey}.json`);
    });
});
