import { diffCookies } from '@crawlee/core';

const cookie1 = 'test_cookie=1';
const cookie2 = 'new_test_cookie=2';

const mergedCookies = [cookie1, cookie2].join(';');

const url = 'https://example.com';

describe('CrawlerUtils', () => {
    describe('diffCookies', () => {
        test('when no cookies are provided for cookiesString2, return an empty string', () => {
            expect(diffCookies(url, cookie1, '')).toEqual('');
        });

        test('when no cookies are provided for cookiesString1, return cookiesString2', () => {
            expect(diffCookies(url, '', cookie1)).toEqual(cookie1);
        });

        test('when new cookies are provided for cookiesString2, return them', () => {
            expect(diffCookies(url, cookie1, cookie2)).toEqual(cookie2);
        });

        test('when new cookies include previous cookies for cookiesString2, return only the new ones', () => {
            expect(diffCookies(url, cookie1, mergedCookies)).toEqual(cookie2);
        });
    });
});
