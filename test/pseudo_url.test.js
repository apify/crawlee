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
});
