import type { ISession } from '@crawlee/types';

import { TimeoutError } from '@apify/timeout';

/**
 * Handles timeout request
 * @internal
 */
export function handleRequestTimeout({ session, errorMessage }: { session?: ISession; errorMessage: string }) {
    session?.markBad();
    const timeoutMillis = /(\d+)\s?ms/.exec(errorMessage)?.[1]; // first capturing group
    const timeoutSecs = Number(timeoutMillis) / 1000;
    throw new TimeoutError(`Navigation timed out after ${timeoutSecs} seconds.`);
}
