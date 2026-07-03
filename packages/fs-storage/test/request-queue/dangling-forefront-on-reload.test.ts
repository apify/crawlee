import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FileSystemStorageClient } from '@crawlee/fs-storage';
import type { InternalRequest } from '@crawlee/fs-storage/src/resource-clients/request-queue';
import type { RequestSchema } from '@crawlee/types';
import { ensureDir } from 'fs-extra/esm';

/**
 * On reload, `forefrontRequestIds` is restored verbatim from the persisted metadata, while the
 * `requests` map is rebuilt only from request files actually found and parseable on disk. If a
 * persisted forefront id has no backing request file (deleted, never written, or corrupt JSON), it
 * would dangle: a later head scan resolves it to a missing request and dereferences `undefined`.
 * The reload must drop such ids so head scans stay safe.
 */
describe('Request queue reload drops dangling forefront ids without a backing request file', () => {
    const tmpLocation = resolve(import.meta.dirname, './tmp/req-queue-dangling-forefront');

    const writeMetadata = async (storage: FileSystemStorageClient, forefrontRequestIds: string[]) => {
        await ensureDir(resolve(storage.requestQueuesDirectory, 'default'));
        await writeFile(
            resolve(storage.requestQueuesDirectory, 'default/__metadata__.json'),
            JSON.stringify({
                id: randomUUID(),
                name: 'default',
                createdAt: new Date(2022, 0, 1),
                accessedAt: new Date(2022, 0, 1),
                modifiedAt: new Date(2022, 0, 1),
                pendingRequestCount: 1,
                handledRequestCount: 0,
                forefrontRequestIds,
            }),
        );
    };

    const writeValidRequest = async (storage: FileSystemStorageClient, id: string, url: string, uniqueKey: string) => {
        await writeFile(
            resolve(storage.requestQueuesDirectory, `default/${id}.json`),
            JSON.stringify({
                id,
                orderNo: -1,
                url,
                uniqueKey,
                method: 'GET',
                retryCount: 0,
                json: JSON.stringify({ id, url, uniqueKey } satisfies RequestSchema),
            } satisfies InternalRequest),
        );
    };

    afterEach(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('a forefront id with no request file on disk does not crash a later head scan', async () => {
        const storage = new FileSystemStorageClient({ localDataDirectory: tmpLocation });

        // The metadata references a forefront id 'missing' for which no request file exists on disk.
        await writeMetadata(storage, ['missing']);

        const queue = await storage.createRequestQueueClient({ name: 'default' });

        // None of these head scans must throw, and an empty/finished queue must be reported.
        await expect(queue.isEmpty()).resolves.toBe(true);
        await expect(queue.isFinished()).resolves.toBe(true);
        await expect(queue.fetchNextRequest()).resolves.toBeUndefined();
    });

    test('a valid forefront request is still served while a dangling sibling id is dropped', async () => {
        const storage = new FileSystemStorageClient({ localDataDirectory: tmpLocation });

        // Two forefront ids in metadata: one backed by a real file, one dangling.
        await writeMetadata(storage, ['missing', '123']);
        await writeValidRequest(storage, '123', 'http://example.com', 'owo');

        const queue = await storage.createRequestQueueClient({ name: 'default' });

        // The dangling id is dropped; the valid forefront request is still fetchable.
        const first = await queue.fetchNextRequest();
        expect(first).not.toBeNull();
        expect(first!.url).toEqual('http://example.com');

        expect(await queue.fetchNextRequest()).toBeUndefined();
    });
});
