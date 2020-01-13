import { Cookie } from 'tough-cookie';

/**
 *
 * @param response
 * @return {undefined|Array}
 */
export const getCookiesFromResponse = (response) => {
    const headers = typeof response.headers === 'function' ? response.headers() : response.headers;
    let cookies;

    if (Array.isArray(headers['set-cookie'])) {
        cookies = headers['set-cookie'].map(Cookie.parse);
    } else {
        cookies = [Cookie.parse(headers['set-cookie'])];
    }

    return cookies;
};
