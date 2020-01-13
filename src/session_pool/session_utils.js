import { Cookie } from 'tough-cookie';
import { CookieParseError } from './errors';

/**
 *
 * @param response
 * @return {undefined|Array}
 */
export const getCookiesFromResponse = (response) => {
    const { headers } = response;
    const cookieHeader = headers['set-cookie'] || '';

    try {
        return Array.isArray(cookieHeader) ? cookieHeader.map(Cookie.parse) : [Cookie.parse(cookieHeader)];
    } catch (e) {
        throw new CookieParseError(cookieHeader);
    }
};
