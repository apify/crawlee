"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeCookies = exports.cookieStringToToughCookie = exports.browserPoolCookieToToughCookie = exports.toughCookieToBrowserPoolCookie = exports.getDefaultCookieExpirationDate = exports.getCookiesFromResponse = void 0;
const tough_cookie_1 = require("tough-cookie");
const errors_1 = require("./session_pool/errors");
const log_1 = require("./log");
/**
 * @internal
 */
function getCookiesFromResponse(response) {
    const headers = typeof response.headers === 'function' ? response.headers() : response.headers;
    const cookieHeader = headers['set-cookie'] || '';
    try {
        return Array.isArray(cookieHeader)
            ? cookieHeader.map((cookie) => tough_cookie_1.Cookie.parse(cookie))
            : [tough_cookie_1.Cookie.parse(cookieHeader)];
    }
    catch (e) {
        throw new errors_1.CookieParseError(cookieHeader);
    }
}
exports.getCookiesFromResponse = getCookiesFromResponse;
/**
 * Calculate cookie expiration date
 * @param maxAgeSecs
 * @returns Calculated date by session max age seconds.
 * @internal
 */
function getDefaultCookieExpirationDate(maxAgeSecs) {
    return new Date(Date.now() + (maxAgeSecs * 1000));
}
exports.getDefaultCookieExpirationDate = getDefaultCookieExpirationDate;
/**
 * Transforms tough-cookie to puppeteer cookie.
 * @param toughCookie Cookie from CookieJar
 * @return Cookie compatible with browser pool
 * @internal
 */
function toughCookieToBrowserPoolCookie(toughCookie) {
    return {
        name: toughCookie.key,
        value: toughCookie.value,
        // Puppeteer and Playwright expect 'expires' to be 'Unix time in seconds', not ms
        // If there is no expires date (so defaults to Infinity), we don't provide it to the browsers
        expires: toughCookie.expires === 'Infinity' ? undefined : new Date(toughCookie.expires).getTime() / 1000,
        domain: toughCookie.domain ?? undefined,
        path: toughCookie.path ?? undefined,
        secure: toughCookie.secure,
        httpOnly: toughCookie.httpOnly,
    };
}
exports.toughCookieToBrowserPoolCookie = toughCookieToBrowserPoolCookie;
/**
 * Transforms browser-pool cookie to tough-cookie.
 * @param cookieObject Cookie object (for instance from the `page.cookies` method).
 * @internal
 */
function browserPoolCookieToToughCookie(cookieObject, maxAgeSecs) {
    const isExpiresValid = cookieObject.expires && typeof cookieObject.expires === 'number' && cookieObject.expires > 0;
    const expires = isExpiresValid ? new Date(cookieObject.expires * 1000) : getDefaultCookieExpirationDate(maxAgeSecs);
    const domain = typeof cookieObject.domain === 'string' && cookieObject.domain.startsWith('.')
        ? cookieObject.domain.slice(1)
        : cookieObject.domain;
    return new tough_cookie_1.Cookie({
        key: cookieObject.name,
        value: cookieObject.value,
        expires,
        domain,
        path: cookieObject.path,
        secure: cookieObject.secure,
        httpOnly: cookieObject.httpOnly,
    });
}
exports.browserPoolCookieToToughCookie = browserPoolCookieToToughCookie;
/**
 * @internal
 * @param cookieString The cookie string to attempt parsing
 * @returns Browser pool compatible cookie, or null if cookie cannot be parsed
 */
function cookieStringToToughCookie(cookieString) {
    const parsed = tough_cookie_1.Cookie.parse(cookieString);
    if (parsed) {
        return toughCookieToBrowserPoolCookie(parsed);
    }
    return null;
}
exports.cookieStringToToughCookie = cookieStringToToughCookie;
/**
 * Merges multiple cookie strings. Keys are compared case-sensitively, warning will be logged
 * if we see two cookies with same keys but different casing.
 * @internal
 */
function mergeCookies(url, sourceCookies) {
    const jar = new tough_cookie_1.CookieJar();
    // ignore empty cookies
    for (const sourceCookieString of sourceCookies) {
        // ignore empty cookies
        if (!sourceCookieString)
            continue;
        const cookies = sourceCookieString.split(/ *; */);
        for (const cookieString of cookies) {
            // ignore extra spaces
            if (!cookieString)
                continue;
            const cookie = tough_cookie_1.Cookie.parse(cookieString);
            const similarKeyCookie = jar.getCookiesSync(url).find((c) => {
                return cookie.key !== c.key && cookie.key.toLowerCase() === c.key.toLowerCase();
            });
            if (similarKeyCookie) {
                log_1.log.deprecated(`Found cookies with similar name during cookie merging: '${cookie.key}' and '${similarKeyCookie.key}'`);
            }
            jar.setCookieSync(cookie, url);
        }
    }
    return jar.getCookieStringSync(url);
}
exports.mergeCookies = mergeCookies;
//# sourceMappingURL=cookie_utils.js.map