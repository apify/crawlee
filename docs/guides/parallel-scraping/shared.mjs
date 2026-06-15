import { RequestQueue } from 'crawlee';

// The request queue shared by all the parallel workers
let queue;

/**
 * @param {boolean} makeFresh Whether the queue should be cleared before returning it
 * @returns The queue
 */
export async function getOrInitQueue(makeFresh = false) {
    if (queue) {
        return queue;
    }

    queue = await RequestQueue.open('shop-urls');

    if (makeFresh) {
        await queue.drop();
        queue = await RequestQueue.open('shop-urls');
    }

    return queue;
}
