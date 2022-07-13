import { Cookie } from 'tough-cookie';
import { getCookiesFromResponse } from '@crawlee/core';
import type { Dictionary } from '@crawlee/utils';

describe('getCookiesFromResponse', () => {
    test('should parse cookies if set-cookie is array', () => {
        const headers: Dictionary<string | string[]> = {};
        const dummyCookies = ['CSRF=e8b667; Domain=example.com; Secure', 'id=a3fWa; Expires=Wed, 21 Oct 2015 07:28:00 GMT'];
        headers['set-cookie'] = dummyCookies;
        const cookies = getCookiesFromResponse({ headers });

        cookies.forEach((cookie) => {
            expect(cookie).toBeInstanceOf(Cookie);
        });

        expect(dummyCookies[0]).toEqual(cookies[0].toString());
        expect(dummyCookies[1]).toEqual(cookies[1].toString());
    });

    test('should parse cookies if set-cookie is string', () => {
        const headers: Dictionary<string | string[]> = {};
        const dummyCookie = 'CSRF=e8b667; Domain=example.com; Secure';
        headers['set-cookie'] = dummyCookie;
        const cookies = getCookiesFromResponse({ headers });

        expect(cookies).toHaveLength(1);
        expect(dummyCookie).toEqual(cookies[0].toString());
        expect(cookies[0]).toBeInstanceOf(Cookie);
    });

    test('should not throw error on parsing invalid cookie', () => {
        const headers: Dictionary<string | string[]> = {};
        const dummyCookie = 'totally Invalid Cookie $@$@#$**';
        headers['set-cookie'] = dummyCookie;
        const cookies = getCookiesFromResponse({ headers });

        expect(cookies).toHaveLength(1);
        expect(cookies[0]).toBeUndefined();
    });
});
