import { randomUUID } from 'node:crypto';

import type { CrawleeLogger } from '@crawlee/types';

import type { BackgroundHandlerReceivedMessage } from '../utils.js';
import { handleMessage } from './fs-utils.js';

/**
 * A map of promises that are created when a background task is scheduled.
 * This is used in MemoryStorage#teardown to wait for all tasks to finish executing before exiting the process.
 * @internal
 */
export const promiseMap: Map<
    string,
    {
        promise: Promise<void>;
        resolve: () => void;
    }
> = new Map();

export function scheduleBackgroundTask(message: BackgroundHandlerReceivedMessage, logger?: CrawleeLogger) {
    const id = randomUUID();

    let promiseResolve: () => void;
    const promise = new Promise<void>((res) => {
        promiseResolve = res;
    });

    promiseMap.set(id, {
        promise,
        resolve: promiseResolve!,
    });

    void handleBackgroundMessage(
        {
            ...message,
            messageId: id,
        },
        logger,
    );
}

async function handleBackgroundMessage(
    message: BackgroundHandlerReceivedMessage & { messageId: string },
    logger?: CrawleeLogger,
) {
    await handleMessage(message, logger);

    promiseMap.get(message.messageId)?.resolve();
    promiseMap.delete(message.messageId);
}
