import type { BrowserLikeResponse, Dictionary } from '@crawlee/types';
import type { IncomingMessage } from 'node:http';
import { Cookie } from 'tough-cookie';
import { CookieParseError } from './errors';

/**
 * @internal
 */
export function getCookiesFromResponse(response: IncomingMessage | BrowserLikeResponse | { headers: Dictionary<string | string[]> }): Cookie[] {
    const headers = typeof response.headers === 'function' ? response.headers() : response.headers;
    const cookieHeader = headers['set-cookie'] || '';

    try {
        return Array.isArray(cookieHeader)
            ? cookieHeader.map((cookie) => Cookie.parse(cookie)!)
            : [Cookie.parse(cookieHeader)!];
    } catch (e) {
        throw new CookieParseError(cookieHeader);
    }
}
