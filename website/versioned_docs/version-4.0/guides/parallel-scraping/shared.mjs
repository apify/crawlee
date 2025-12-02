import { RequestQueueV2 } from 'crawlee';

// Create the request queue that also supports parallelization
let queue;

/**
 * @param {boolean} makeFresh Whether the queue should be cleared before returning it
 * @returns The queue
 */
export async function getOrInitQueue(makeFresh = false) {
    if (queue) {
        return queue;
    }

    queue = await RequestQueueV2.open('shop-urls');

    if (makeFresh) {
        await queue.drop();
        queue = await RequestQueueV2.open('shop-urls');
    }

    return queue;
}
