import Apify from '../build/index';

describe('Apify.PseudoUrl', () => {
    test('matches() should work', () => {
        let purl = new Apify.PseudoUrl('http://www.example.com/PAGES/[(\\w|-)*]');

        expect(purl.matches('http://www.example.com/PAGES/')).toBe(true);
        expect(purl.matches('http://www.example.com/pages/my-awesome-page')).toBe(true);
        expect(purl.matches('http://www.example.com/PAGES/not@working')).toBe(false);

        purl = new Apify.PseudoUrl(/example\.com\/pages/);

        expect(purl.matches('http://www.example.com/PAGES/')).toBe(false);
        expect(purl.matches('http://www.example.com/pages/my-awesome-page')).toBe(true);
        expect(purl.matches('http://www.example.com/pages/not@working')).toBe(true);
    });

    test('createRequest() should work with a string', () => {
        const purl = new Apify.PseudoUrl('something', { method: 'POST', userData: { foo: 'bar' } });
        const request = purl.createRequest('http://example.com');

        expect(request).toBeInstanceOf(Apify.Request);
        expect(request.url).toBe('http://example.com');
        expect(request.method).toBe('POST');
        expect(request.userData).toEqual({ foo: 'bar' });
    });

    test('createRequest() should work with an object', () => {
        const purl = new Apify.PseudoUrl('something', { method: 'POST', userData: { foo: 'bar' } });
        const request = purl.createRequest({
            url: 'http://example.com',
            userData: {
                bar: 'foo',
            },
        });

        expect(request).toBeInstanceOf(Apify.Request);
        expect(request.url).toBe('http://example.com');
        expect(request.method).toBe('POST');
        expect(request.userData).toEqual({ foo: 'bar', bar: 'foo' });
    });

    test('should not break on escaped square brackets in regex', () => {
        // the string really is 'http://example.com/[\[]', but \ needs to be escaped
        // i.e. the pseudourl contains a regex, which should simply match '['
        let purl = new Apify.PseudoUrl('http://example.com/[\\[]');
        expect(purl.matches('http://example.com/[')).toBe(true);

        purl = new Apify.PseudoUrl('http://example.com/[\\]]');
        expect(purl.matches('http://example.com/]')).toBe(true);
    });

    test('should not break on escaped square brackets outside regex', () => {
        // the string really is 'http://example.com/\[', but \ needs to be escaped
        let purl = new Apify.PseudoUrl('http://example.com/\\[');
        expect(purl.matches('http://example.com/[')).toBe(true);

        purl = new Apify.PseudoUrl('http://example.com/\\]');
        expect(purl.matches('http://example.com/]')).toBe(true);
    });

    test('should throw on unclosed regex directive', () => {
        expect(() => new Apify.PseudoUrl('http://example.com/[')).toThrow('unclosed regex directive');
        expect(() => new Apify.PseudoUrl('http://example.com/]')).toThrow('stray \']\'');
    });
});
