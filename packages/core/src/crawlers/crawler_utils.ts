import { TimeoutError } from '@apify/timeout';
import type { Session } from '../session_pool/session';

/**
 * Handles timeout request
 * @internal
 */
export function handleRequestTimeout({ session, errorMessage }: { session?: Session; errorMessage: string }) {
    session?.markBad();
    const timeoutMillis = errorMessage.match(/(\d+)\s?ms/)?.[1]; // first capturing group
    const timeoutSecs = Number(timeoutMillis) / 1000;
    throw new TimeoutError(`Navigation timed out after ${timeoutSecs} seconds.`);
}
