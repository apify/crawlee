import { TimeoutError } from '@apify/timeout';

import type { Session } from '../session_pool/session.js';

/**
 * Handles timeout request
 * @internal
 */
export function handleRequestTimeout({ session, errorMessage }: { session?: Session; errorMessage: string }) {
    session?.markBad();

    // Look for both "ms" and "seconds" patterns
    const timeoutMillis = errorMessage.match(/(\d+)\s?ms/)?.[1];
    const timeoutSecs = errorMessage.match(/(\d+(?:\.\d+)?)\s?seconds?/)?.[1];

    let finalTimeoutSecs: number;
    if (timeoutMillis) {
        finalTimeoutSecs = Number(timeoutMillis) / 1000;
    } else if (timeoutSecs) {
        finalTimeoutSecs = Number(timeoutSecs);
    } else {
        finalTimeoutSecs = 0; // fallback
    }

    throw new TimeoutError(`Navigation timed out after ${finalTimeoutSecs} seconds.`);
}
