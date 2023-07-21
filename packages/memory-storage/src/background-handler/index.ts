import { randomUUID } from 'node:crypto';

import { handleMessage } from './fs-utils';
import type { BackgroundHandlerReceivedMessage } from '../utils';

export const promiseMap: Map<string, {
    promise: Promise<void>;
    resolve: () => void;
}> = new Map();

export function scheduleBackgroundTask(message: BackgroundHandlerReceivedMessage) {
    const id = randomUUID();

    let promiseResolve: () => void;
    const promise = new Promise<void>((res) => {
        promiseResolve = res;
    });

    promiseMap.set(id, {
        promise,
        resolve: promiseResolve!,
    });

    void handleBackgroundMessage({
        ...message,
        messageId: id,
    });
}

async function handleBackgroundMessage(message: BackgroundHandlerReceivedMessage & { messageId: string }) {
    await handleMessage(message);

    promiseMap.get(message.messageId)?.resolve();
    promiseMap.delete(message.messageId);
}
