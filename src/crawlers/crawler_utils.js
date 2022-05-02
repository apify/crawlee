import { Cookie, CookieJar } from 'tough-cookie';
// TYPE IMPORTS
/* eslint-disable no-unused-vars */
import { Session } from '../session_pool/session';
import log from '../utils_log';
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

/**
 * Merges multiple cookie strings. Keys are compared case-sensitively, warning will be logged
 * if we see two cookies with same keys but different casing.
 *
 * @param {string} url
 * @param {string[]} sourceCookies
 * @return {string}
 * @private
 */
export function mergeCookies(url, sourceCookies) {
    const jar = new CookieJar();

    // ignore empty cookies
    for (const sourceCookieString of sourceCookies.filter((c) => c)) {
        const cookies = sourceCookieString.split(/ *; */).filter((c) => c); // ignore extra spaces

        for (const cookieString of cookies) {
            const cookie = Cookie.parse(cookieString);
            const similarKeyCookie = jar.getCookiesSync(url).find((c) => {
                return cookie.key !== c.key && cookie.key.toLowerCase() === c.key.toLowerCase();
            });

            if (similarKeyCookie) {
                log.deprecated(`Found cookies with similar name during cookie merging: '${cookie.key}' and '${similarKeyCookie.key}'`);
            }

            jar.setCookieSync(cookie, url);
        }
    }

    return jar.getCookieStringSync(url);
}

/**
 * @param {string} url
 * @param {string} [cookieString1='']
 * @param {string} [cookieString2='']
 * @return {string}
 * @private
 */
export function diffCookies(url, cookieString1 = '', cookieString2 = '') {
    if (cookieString1 === cookieString2 || !cookieString2) {
        return '';
    }

    if (!cookieString1) {
        return cookieString2;
    }

    const cookies1 = cookieString1.split(/ *; */).filter((item) => Boolean(item)).map((cookie) => Cookie.parse(cookie));
    const cookies2 = cookieString2.split(/ *; */).filter((item) => Boolean(item)).map((cookie) => Cookie.parse(cookie));

    const added = cookies2.filter((newCookie) => {
        return !cookies1.find((oldCookie) => newCookie.toString() === oldCookie.toString());
    });
    const jar = new CookieJar();
    added.forEach((cookie) => jar.setCookieSync(cookie, url));

    return jar.getCookieStringSync(url);
}
