import type { RequestOptions } from '@crawlee/core';
import {
    applyRequestTransform,
    constructGlobObjectsFromGlobs,
    constructRegExpObjectsFromRegExps,
    constructUrlPatternObjects,
    createRequestOptions,
    filterRequestOptionsByPatterns,
    validateGlobPattern,
} from '@crawlee/core';

describe('Enqueue links shared functions', () => {
    describe('constructGlobObjectsFromGlobs()', () => {
        test('should work', () => {
            const globs = ['https://example.com/**/*', { glob: '?(http|https)://cool.com/' }];
            const globObjects = constructGlobObjectsFromGlobs(globs);
            expect(globObjects).toHaveLength(2);
            expect(globObjects[0].glob).toEqual('https://example.com/**/*');
            expect(globObjects[1].glob).toEqual('?(http|https)://cool.com/');
        });
    });

    describe('constructRegExpObjectsFromRegExps()', () => {
        test('should work', () => {
            const regexps = [/^https:\/\/example\.com\/(\w|\/)+/, { regexp: /^(http|https):\/\/cool\.com\// }];
            const regexpObjects = constructRegExpObjectsFromRegExps(regexps);
            expect(regexpObjects).toHaveLength(2);
            expect(regexpObjects[0].regexp.test('https://example.com/')).toBe(false);
            expect(regexpObjects[1].regexp.test('https://cool.com/')).toBe(true);
        });
    });

    describe('constructUrlPatternObjects()', () => {
        test('should handle mixed glob and regexp patterns', () => {
            const patterns = [
                'https://example.com/**/*',
                { glob: 'https://cool.com/**' },
                /^https:\/\/foo\.com/,
                { regexp: /bar\.com/ },
            ];
            const objects = constructUrlPatternObjects(patterns);
            expect(objects).toHaveLength(4);
            expect(objects[0]).toHaveProperty('glob', 'https://example.com/**/*');
            expect(objects[1]).toHaveProperty('glob', 'https://cool.com/**');
            expect(objects[2]).toHaveProperty('regexp');
            expect(objects[3]).toHaveProperty('regexp');
        });
    });

    describe('caching', () => {
        test('should cache items', () => {
            const globs0 = constructGlobObjectsFromGlobs(['https://example.com/**/*']);
            const globs1 = constructGlobObjectsFromGlobs(['https://example.com/**/*']);
            expect(globs0[0]).toEqual(globs1[0]);

            const regexps0 = constructRegExpObjectsFromRegExps([/^https:\/\/example\.com\/(\w|\/)+/]);
            const regexps1 = constructRegExpObjectsFromRegExps([/^https:\/\/example\.com\/(\w|\/)+/]);
            expect(regexps0[0]).toEqual(regexps1[0]);
        });
    });

    describe('filterRequestOptionsByPatterns() + applyRequestTransform()', () => {
        test('should filter by patterns and apply transform', () => {
            const sources = [
                'http://example.com/foo',
                { url: 'https://example.com/bar', method: 'POST' as const, label: 'POST-REQUEST' },
                'https://apify.com',
            ];
            const urlPatternObjects = constructUrlPatternObjects([/^https?:\/\/example\.com\/.*/]);

            const transformRequestFunction = (request: RequestOptions) => {
                request.userData = { ...request.userData, foo: 'bar' };
                return request;
            };

            const requestOptions = createRequestOptions(sources);
            const filtered = filterRequestOptionsByPatterns(requestOptions, urlPatternObjects);
            const transformed = applyRequestTransform(filtered, transformRequestFunction);

            expect(transformed).toHaveLength(2);
            transformed.forEach((r) => {
                expect(r.url).toMatch(/^https?:\/\/example\.com\//);
                expect(r.userData).toMatchObject({ foo: 'bar' });
            });
            expect(transformed[0].method).toBeUndefined(); // defaults to GET when Request is constructed
            expect(transformed[1].method).toBe('POST');
        });
    });

    describe('validateGlobPattern()', () => {
        test('should throw for empty glob patterns', () => {
            const globPattern = 'https://example.com/**/*';
            expect(() => validateGlobPattern(globPattern)).not.toThrow();
            const emptyGlobPattern = '';
            expect(() => validateGlobPattern(emptyGlobPattern)).toThrow(
                /Cannot parse Glob pattern '': it must be an non-empty string/,
            );
        });
    });
});
