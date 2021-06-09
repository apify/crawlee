// TYPE IMPORTS
/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order */
import { Session } from '../session_pool/session';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

/**
 * Handles timeout request
 * @param {Session} session
 * @param {string} errorMessage
 * @private
 */
export function handleRequestTimeout(session, errorMessage) {
    if (session) session.markBad();
    const timeoutMillis = errorMessage.match(/(\d+)\s?ms/)[1]; // first capturing group
    const timeoutSecs = Number(timeoutMillis) / 1000;
    throw new Error(`Navigation timed out after ${timeoutSecs} seconds.`);
}

/**
 * Handles blocked request
 * @param {Session} session
 * @param {number} statusCode
 * @private
 */
export function throwOnBlockedRequest(session, statusCode) {
    const isBlocked = session.retireOnBlockedStatusCodes(statusCode);

    if (isBlocked) {
        throw new Error(`Request blocked - received ${statusCode} status code.`);
    }
}
