import { Cookie } from 'tough-cookie';
import { CookieParseError } from './errors';

/**
 *
 * @param response
 * @return {undefined|Array}
 */
export const getCookiesFromResponse = (response) => {
    const headers = typeof response.headers === 'function' ? response.headers() : response.headers;
    const cookieHeader = headers['set-cookie'] || '';

    try {
        return Array.isArray(cookieHeader) ? cookieHeader.map(Cookie.parse) : [Cookie.parse(cookieHeader)];
    } catch (e) {
        throw new CookieParseError(cookieHeader);
    }
};
