import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { MemoryStorage } from '@crawlee/memory-storage';
import type { InternalRequest } from '@crawlee/memory-storage/src/resource-clients/request-queue';
import type { RequestSchema } from '@crawlee/types';
import { ensureDir } from 'fs-extra';

describe('when falling back to fs, Request queue should ignore non-JSON files', () => {
    const tmpLocation = resolve(__dirname, './tmp/req-queue-ignore-non-json');
    const storage = new MemoryStorage({
        localDataDirectory: tmpLocation,
    });

    beforeAll(async () => {
        // Create "default" request queue and give it faulty entries
        await ensureDir(resolve(storage.requestQueuesDirectory, 'default'));
        await writeFile(resolve(storage.requestQueuesDirectory, 'default/__metadata__.json'), JSON.stringify({
            id: randomUUID(),
            name: 'default',
            createdAt: new Date(2022, 0, 1),
            accessedAt: new Date(2022, 0, 1),
            modifiedAt: new Date(2022, 0, 1),
        }));

        await writeFile(resolve(storage.requestQueuesDirectory, 'default/123.json'), JSON.stringify({
            id: '123',
            orderNo: 1,
            url: 'http://example.com',
            uniqueKey: 'owo',
            method: 'GET',
            retryCount: 0,
            json: JSON.stringify({
                uniqueKey: 'owo',
                url: 'http://example.com',
                id: '123',
            } satisfies RequestSchema),
        } satisfies InternalRequest));

        await writeFile(resolve(storage.requestQueuesDirectory, 'default/.DS_Store'), 'owo');
        await writeFile(resolve(storage.requestQueuesDirectory, 'default/invalid.txt'), 'owo');
    });

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('attempting to list "default" request queue should ignore non-JSON files', async () => {
        const defaultQueueInfo = await storage.requestQueues().getOrCreate('default');
        const defaultQueue = storage.requestQueue(defaultQueueInfo.id);

        expect(defaultQueueInfo.name).toEqual('default');

        const requests = await defaultQueue.listHead();
        expect(requests.items).toHaveLength(1);
    });
});
