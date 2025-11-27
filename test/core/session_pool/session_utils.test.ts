import { getCookiesFromResponse } from '@crawlee/core';
import { Cookie } from 'tough-cookie';

describe('getCookiesFromResponse', () => {
    test('should parse cookies if set-cookie is array', () => {
        const headers = new Headers();

        headers.append('set-cookie', 'CSRF=e8b667; Domain=example.com; Secure ');
        headers.append('set-cookie', 'id=a3fWa; Expires=Wed, 21 Oct 2015 07:28:00 GMT');

        const cookies = getCookiesFromResponse(new Response('', { headers }));

        cookies.forEach((cookie) => {
            expect(cookie).toBeInstanceOf(Cookie);
        });

        expect(cookies[0].toString()).toEqual('CSRF=e8b667; Domain=example.com; Secure');
        expect(cookies[1].toString()).toEqual('id=a3fWa; Expires=Wed, 21 Oct 2015 07:28:00 GMT');
    });

    test('should parse cookies if set-cookie is string', () => {
        const headers = new Headers();
        headers.append('set-cookie', 'CSRF=e8b667; Domain=example.com; Secure ');

        const cookies = getCookiesFromResponse(new Response('', { headers }));

        expect(cookies).toHaveLength(1);
        expect(cookies[0].toString()).toEqual('CSRF=e8b667; Domain=example.com; Secure');
        expect(cookies[0]).toBeInstanceOf(Cookie);
    });

    test('should not throw error on parsing invalid cookie', () => {
        const headers = new Headers();
        headers.append('set-cookie', 'totally Invalid Cookie $@$@#$**');

        const cookies = getCookiesFromResponse(new Response('', { headers }));

        expect(cookies).toHaveLength(1);
        expect(cookies[0]).toBeUndefined();
    });
});
