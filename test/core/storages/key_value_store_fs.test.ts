import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { KeyValueFileSystemEntry } from '@crawlee/memory-storage/src/fs/key-value-store/fs';
import { memoryStorageLog } from '@crawlee/memory-storage/src/utils';

describe('KeyValueFileSystemEntry', () => {
    let baseDir: string;

    beforeEach(async () => {
        baseDir = await mkdtemp(join(tmpdir(), 'crawlee-kvs-'));
    });

    afterEach(async () => {
        await rm(baseDir, { recursive: true, force: true });
    });

    test('extension-less warning keeps a backslash in the store directory name', async () => {
        // A backslash is a legal filename character on POSIX, so it must not be
        // treated as a path separator when the store name is put into the warning.
        const storeDirectory = join(baseDir, 'my\\weird\\store');
        const entry = new KeyValueFileSystemEntry({ storeDirectory, writeMetadata: false, persistStorage: true });

        // `update` records the key/extension and remembers the path it wrote to.
        await entry.update({ key: 'my-key', value: 'hello', extension: 'txt' });

        // Drop the file `update` wrote and leave only an extension-less file so
        // `get` falls back to the branch that logs the warning.
        await rm(join(storeDirectory, 'my-key.txt'), { force: true });
        await writeFile(join(storeDirectory, 'my-key'), 'hello');

        const warning = vitest.spyOn(memoryStorageLog, 'warning').mockImplementation(() => {});

        const record = await entry.get();

        expect(record.value).toBe('hello');
        expect(warning).toHaveBeenCalledTimes(1);
        expect(warning.mock.calls[0][0]).toContain('for store my\\weird\\store');
    });
});
