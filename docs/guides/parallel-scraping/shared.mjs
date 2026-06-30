import { FileSystemStorageClient } from '@crawlee/fs-storage';
import { RequestQueue } from 'crawlee';

// The request queue shared by all the parallel workers
let queue;

// The `shop-urls` queue is opened concurrently by every worker process, so it must use the
// concurrency-safe locking behavior. With `requestQueueAccess: 'shared'`, a request another worker
// is still processing is treated as a live peer's lock and is not handed out again until that lock
// expires — so two workers never scrape the same URL at once. (We point at the default `./storage`
// location, which is where this shared queue lives.)
const sharedStorageClient = new FileSystemStorageClient({ requestQueueAccess: 'shared' });

/**
 * @param {boolean} makeFresh Whether the queue should be cleared before returning it
 * @returns The queue
 */
export async function getOrInitQueue(makeFresh = false) {
    if (queue) {
        return queue;
    }

    queue = await RequestQueue.open('shop-urls', { storageClient: sharedStorageClient });

    if (makeFresh) {
        await queue.drop();
        queue = await RequestQueue.open('shop-urls', { storageClient: sharedStorageClient });
    }

    return queue;
}
