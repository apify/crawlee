import { processHttpRequestOptions } from '@crawlee/core';

describe('processHttpRequestOptions', () => {
    test('applies search parameters to the request URL', () => {
        const request = processHttpRequestOptions({
            url: 'https://example.com/path?previous=value',
            searchParams: {
                query: 'hello world',
                page: 2,
                empty: null,
                skipped: undefined,
            },
        });

        expect(request.url.toString()).toBe('https://example.com/path?query=hello+world&page=2&empty=');
    });

    test('throws when multiple body options are provided', () => {
        expect(() =>
            processHttpRequestOptions({
                url: 'https://example.com',
                body: 'body',
                json: { hello: 'world' },
            }),
        ).toThrow('At most one of `body`, `form` and `json` may be specified in sendRequest arguments');
    });

    test('serializes form body and sets default content type', () => {
        const request = processHttpRequestOptions({
            url: 'https://example.com',
            form: {
                hello: 'world',
            },
        });

        expect(request.body).toBe('hello=world');
        expect(request.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
    });

    test('serializes JSON body and keeps user content type', () => {
        const request = processHttpRequestOptions({
            url: 'https://example.com',
            headers: {
                'content-type': 'application/vnd.api+json',
            },
            json: {
                hello: 'world',
            },
        });

        expect(request.body).toBe('{"hello":"world"}');
        expect(request.headers).toEqual({ 'content-type': 'application/vnd.api+json' });
    });

    test('sets basic authorization header from username and password', () => {
        const request = processHttpRequestOptions({
            url: 'https://example.com',
            username: 'user',
            password: 'pass',
        });

        expect(request.headers).toEqual({ authorization: 'Basic dXNlcjpwYXNz' });
    });
});
