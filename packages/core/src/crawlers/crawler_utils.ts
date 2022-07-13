import { TimeoutError } from '@apify/timeout';
import { Cookie, CookieJar } from 'tough-cookie';
import { log } from '../log';
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

/**
 * Merges multiple cookie strings. Keys are compared case-sensitively, warning will be logged
 * if we see two cookies with same keys but different casing.
 * @internal
 */
export function mergeCookies(url: string, sourceCookies: string[]): string {
    const jar = new CookieJar();

    // ignore empty cookies
    for (const sourceCookieString of sourceCookies.filter((c) => c)) {
        const cookies = sourceCookieString.split(/ *; */).filter((c) => c); // ignore extra spaces

        for (const cookieString of cookies) {
            const cookie = Cookie.parse(cookieString)!;
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
 * @internal
 */
export function diffCookies(url: string, cookieString1 = '', cookieString2 = ''): string {
    if (cookieString1 === cookieString2 || !cookieString2) {
        return '';
    }

    if (!cookieString1) {
        return cookieString2;
    }

    const cookies1 = cookieString1.split(/ *; */).filter((item) => Boolean(item)).map((cookie) => Cookie.parse(cookie)!);
    const cookies2 = cookieString2.split(/ *; */).filter((item) => Boolean(item)).map((cookie) => Cookie.parse(cookie)!);

    const added = cookies2.filter((newCookie) => {
        return !cookies1.find((oldCookie) => newCookie.toString() === oldCookie.toString());
    });
    const jar = new CookieJar();
    added.forEach((cookie) => jar.setCookieSync(cookie, url));

    return jar.getCookieStringSync(url);
}
