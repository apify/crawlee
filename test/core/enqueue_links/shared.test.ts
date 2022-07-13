import type { Request } from '@crawlee/core';
import {
    constructGlobObjectsFromGlobs,
    constructRegExpObjectsFromPseudoUrls,
    constructRegExpObjectsFromRegExps,
    createRequests,
    createRequestOptions,
    validateGlobPattern,
} from '@crawlee/core';

describe('Enqueue links shared functions', () => {
    describe('constructGlobObjectsFromGlobs()', () => {
        test('should work', () => {
            const globs = [
                'https://example.com/**/*',
                { glob: '?(http|https)://cool.com/', userData: { foo: 'bar' }, label: 'foobar' },
            ];
            const globObjects = constructGlobObjectsFromGlobs(globs);
            expect(globObjects).toHaveLength(2);
            expect(globObjects[0].glob).toEqual('https://example.com/**/*');
            expect(globObjects[0].userData).toBe(undefined);
            expect(globObjects[1].glob).toEqual('?(http|https)://cool.com/');
            expect(globObjects[1].userData).toStrictEqual({ foo: 'bar' });
            expect(globObjects[1].label).toBe('foobar');
        });
    });

    describe('constructRegExpObjectsFromRegExps()', () => {
        test('should work', () => {
            const regexps = [
                /^https:\/\/example\.com\/(\w|\/)+/,
                { regexp: /^(http|https):\/\/cool\.com\//, userData: { foo: 'bar' } },
            ];
            const regexpObjects = constructRegExpObjectsFromRegExps(regexps);
            expect(regexpObjects).toHaveLength(2);
            expect(regexpObjects[0].regexp.test('https://example.com/')).toBe(false);
            expect(regexpObjects[0].userData).toBe(undefined);
            expect(regexpObjects[1].regexp.test('https://cool.com/')).toBe(true);
            expect(regexpObjects[1].userData).toStrictEqual({ foo: 'bar' });
        });
    });

    describe('constructRegExpObjectsFromPseudoUrls()', () => {
        test('should work', () => {
            const pseudoUrls = [
                'http[s?]://example.com/',
                { purl: 'http[s?]://example.com[.*]', userData: { foo: 'bar' } },
            ];
            const urlPatternObjects = constructRegExpObjectsFromPseudoUrls(pseudoUrls);
            expect(urlPatternObjects).toHaveLength(2);
            urlPatternObjects.forEach((urlPatternObject) => {
                expect(urlPatternObject.regexp.test('https://example.com/')).toBe(true);
            });
            expect(urlPatternObjects[0].regexp.test('https://example.com/foo')).toBe(false);
            expect(urlPatternObjects[0].userData).toBe(undefined);
            expect(urlPatternObjects[1].regexp.test('https://example.com/foo')).toBe(true);
            expect(urlPatternObjects[1].userData).toStrictEqual({ foo: 'bar' });
        });

        test('should cache items', () => {
            const pseudoUrls0 = constructRegExpObjectsFromPseudoUrls(['http[s?]://example.com/[.*]']);
            const pseudoUrls1 = constructRegExpObjectsFromPseudoUrls(['http[s?]://example.com/[.*]']);
            expect(pseudoUrls0[0]).toEqual(pseudoUrls1[0]);

            const globs0 = constructGlobObjectsFromGlobs(['https://example.com/**/*']);
            const globs1 = constructGlobObjectsFromGlobs(['https://example.com/**/*']);
            expect(globs0[0]).toEqual(globs1[0]);

            const regexps0 = constructRegExpObjectsFromRegExps([/^https:\/\/example\.com\/(\w|\/)+/]);
            const regexps1 = constructRegExpObjectsFromRegExps([/^https:\/\/example\.com\/(\w|\/)+/]);
            expect(regexps0[0]).toEqual(regexps1[0]);
        });
    });

    describe('createRequests()', () => {
        test('should work', () => {
            const sources = [
                'http://example.com/foo',
                { url: 'https://example.com/bar', method: 'POST', label: 'POST-REQUEST' },
                'https://apify.com',
            ];
            const pseudoUrls = [{ purl: 'http[s?]://example.com/[.*]', userData: { one: 1 } }];
            const urlPatternObjects = constructRegExpObjectsFromPseudoUrls(pseudoUrls);

            const transformRequestFunction = (request: Request) => {
                request.userData.foo = 'bar';
                return request;
            };

            const requestOptions = createRequestOptions(sources);
            const requests = createRequests(requestOptions, urlPatternObjects).map(transformRequestFunction).filter((r) => !!r);

            expect(requests).toHaveLength(2);
            requests.forEach((r) => {
                expect(r.url).toMatch(/^https?:\/\/example\.com\//);
                expect(r.userData).toMatchObject({ foo: 'bar', one: 1 });
            });
            expect(requests[0].method).toBe('GET');
            expect(requests[1].method).toBe('POST');
            expect(requests[1].userData).toEqual({ foo: 'bar', one: 1, label: 'POST-REQUEST' });
        });
    });

    describe('validateGlobPattern()', () => {
        test('should throw for empty glob patterns', () => {
            const globPattern = 'https://example.com/**/*';
            expect(() => validateGlobPattern(globPattern)).not.toThrow();
            const emptyGlobPattern = '';
            expect(() => validateGlobPattern(emptyGlobPattern)).toThrow(/Cannot parse Glob pattern '': it must be an non-empty string/);
        });
    });
});
