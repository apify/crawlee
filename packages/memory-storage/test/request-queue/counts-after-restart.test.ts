import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { MemoryStorage } from '@crawlee/memory-storage';

describe('RequestQueue counts when reopened from disk', () => {
    const tmpLocation = resolve(__dirname, './tmp/counts-after-restart');

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    test('handled and pending counts are restored without a metadata file', async () => {
        const firstRun = new MemoryStorage({ localDataDirectory: tmpLocation });
        const { id } = await firstRun.requestQueues().getOrCreate('restart');
        const queue = firstRun.requestQueue(id);

        for (let i = 0; i < 5; i++) {
            await queue.addRequest({ url: `http://example.com/${i}`, uniqueKey: `${i}` });
        }

        const { items } = await queue.listHead({ limit: 2 });
        for (const item of items) {
            await queue.updateRequest({ ...item, handledAt: new Date().toISOString() });
        }

        await firstRun.teardown();

        const secondRun = new MemoryStorage({ localDataDirectory: tmpLocation });
        const info = await secondRun.requestQueues().getOrCreate('restart');

        expect(info.handledRequestCount).toBe(2);
        expect(info.pendingRequestCount).toBe(3);
        expect(info.totalRequestCount).toBe(5);
    });
});
