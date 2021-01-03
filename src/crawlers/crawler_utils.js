import { URL } from 'url';

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
    throw new Error(`gotoFunction timed out after ${timeoutSecs} seconds.`);
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

export function getSessionIdFromProxyUrl(proxyUrl) {
    const parsedUrl = new URL(proxyUrl);
    const { username } = parsedUrl.username;
    if (!username) {
        return;
    }
    const parts = username.split(',');
    const sessionPart = parts.find((part) => part.includes('session-'));

    return sessionPart && sessionPart.replace('session-', '');
}
