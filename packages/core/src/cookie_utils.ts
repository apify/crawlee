import type { Cookie as CookieObject } from '@crawlee/types';
import { Cookie, CookieJar } from 'tough-cookie';

import { log } from './log';
import { CookieParseError } from './session_pool/errors';

export interface ResponseLike {
    url?: string | (() => string);
    headers?: Record<string, string | string[] | undefined> | (() => Record<string, string | string[] | undefined>);
}

/**
 * @internal
 */
export function getCookiesFromResponse(response: ResponseLike): Cookie[] {
    const headers = typeof response.headers === 'function' ? response.headers() : response.headers;
    const cookieHeader = headers?.['set-cookie'] || '';

    try {
        return Array.isArray(cookieHeader)
            ? cookieHeader.map((cookie) => Cookie.parse(cookie)!)
            : [Cookie.parse(cookieHeader)!];
    } catch (e) {
        throw new CookieParseError(cookieHeader);
    }
}

/**
 * Calculate cookie expiration date
 * @param maxAgeSecs
 * @returns Calculated date by session max age seconds.
 * @internal
 */
export function getDefaultCookieExpirationDate(maxAgeSecs: number) {
    return new Date(Date.now() + maxAgeSecs * 1000);
}

/**
 * Transforms tough-cookie to puppeteer cookie.
 * @param toughCookie Cookie from CookieJar
 * @return Cookie compatible with browser pool
 * @internal
 */
export function toughCookieToBrowserPoolCookie(toughCookie: Cookie): CookieObject {
    return {
        name: toughCookie.key,
        value: toughCookie.value,
        // Puppeteer and Playwright expect 'expires' to be 'Unix time in seconds', not ms
        // If there is no expires date (so defaults to Infinity), we don't provide it to the browsers
        expires:
            toughCookie.expires == null || toughCookie.expires === 'Infinity'
                ? undefined
                : toughCookie.expires.getTime() / 1000,
        domain: toughCookie.domain ? `${toughCookie.hostOnly ? '' : '.'}${toughCookie.domain}` : undefined,
        path: toughCookie.path ?? undefined,
        secure: toughCookie.secure,
        httpOnly: toughCookie.httpOnly,
    };
}

/**
 * Transforms browser-pool cookie to tough-cookie.
 * @param cookieObject Cookie object (for instance from the `page.cookies` method).
 * @internal
 */
export function browserPoolCookieToToughCookie(cookieObject: CookieObject, maxAgeSecs: number) {
    const isExpiresValid = cookieObject.expires && typeof cookieObject.expires === 'number' && cookieObject.expires > 0;
    const expires = isExpiresValid
        ? new Date(cookieObject.expires! * 1000)
        : getDefaultCookieExpirationDate(maxAgeSecs);
    const domainHasLeadingDot = cookieObject.domain?.startsWith?.('.');
    const domain = domainHasLeadingDot ? cookieObject.domain?.slice?.(1) : cookieObject.domain;
    return new Cookie({
        key: cookieObject.name,
        value: cookieObject.value,
        expires,
        domain,
        path: cookieObject.path,
        secure: cookieObject.secure,
        httpOnly: cookieObject.httpOnly,
        hostOnly: !domainHasLeadingDot,
    });
}

/**
 * @internal
 * @param cookieString The cookie string to attempt parsing
 * @returns Browser pool compatible cookie, or null if cookie cannot be parsed
 */
export function cookieStringToToughCookie(cookieString: string) {
    const parsed = Cookie.parse(cookieString);

    if (parsed) {
        return toughCookieToBrowserPoolCookie(parsed);
    }

    return null;
}

/**
 * Merges multiple cookie strings. Keys are compared case-sensitively, warning will be logged
 * if we see two cookies with same keys but different casing.
 * @internal
 */
export function mergeCookies(url: string, sourceCookies: string[]): string {
    const jar = new CookieJar();

    // ignore empty cookies
    for (const sourceCookieString of sourceCookies) {
        // ignore empty cookies
        if (!sourceCookieString) continue;

        const cookies = sourceCookieString.split(/ *; */);

        for (const cookieString of cookies) {
            // ignore extra spaces
            if (!cookieString) continue;

            const cookie = Cookie.parse(cookieString)!;
            const similarKeyCookie = jar.getCookiesSync(url).find((c) => {
                return cookie.key !== c.key && cookie.key.toLowerCase() === c.key.toLowerCase();
            });

            if (similarKeyCookie) {
                log.deprecated(
                    `Found cookies with similar name during cookie merging: '${cookie.key}' and '${similarKeyCookie.key}'`,
                );
            }

            jar.setCookieSync(cookie, url);
        }
    }

    return jar.getCookieStringSync(url);
}
