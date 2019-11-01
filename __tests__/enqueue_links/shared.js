import PseudoUrl from '../../build/pseudo_url';
import * as shared from '../../build/enqueue_links/shared';

describe('Enqueue links shared functions', () => {
    describe('constructPseudoUrlInstances()', () => {
        it('should work', () => {
            const pseudoUrlSources = [
                new PseudoUrl(/^https?:\/\/example\.com/, { userData: { foo: 'bar' } }),
                /^https?:\/\/example\.com/,
                'http[s?]://example.com/[.*]',
                { purl: 'http[s?]://example.com[.*]', userData: { foo: 'bar' } },
            ];
            const pseudoUrls = shared.constructPseudoUrlInstances(pseudoUrlSources);
            expect(pseudoUrls).toHaveLength(4);
            pseudoUrls.forEach((purl) => {
                expect(purl.matches('https://example.com/foo')).toBe(true);
            });
            let request = pseudoUrls[0].createRequest('https://example.com/foo');
            expect(request.userData).toEqual({ foo: 'bar' });
            request = pseudoUrls[3].createRequest('https://example.com/bar');
            expect(request.userData).toEqual({ foo: 'bar' });
        });

        it('should cache items', () => {
            const pseudoUrls = shared.constructPseudoUrlInstances(['http[s?]://example.com/[.*]']);
            const pseudoUrls2 = shared.constructPseudoUrlInstances(['http[s?]://example.com/[.*]']);
            expect(pseudoUrls[0] === pseudoUrls2[0]).toBe(true);
        });
    });

    describe('createRequests()', () => {
        it('should work', () => {
            const sources = [
                'http://example.com/foo',
                { url: 'https://example.com/bar', method: 'POST' },
                'https://apify.com',
            ];
            const pseudoUrls = [
                new PseudoUrl('http[s?]://example.com/[.*]', { userData: { one: 1 } }),
            ];

            const userData = { bar: 'foo' };
            const requestOptions = shared.createRequestOptions(sources, userData);
            const requests = shared.createRequests(requestOptions, pseudoUrls);

            expect(requests).toHaveLength(2);
            requests.forEach((r) => {
                expect(r.url).toMatch(/^https?:\/\/example\.com\//);
                expect(r.userData).toMatchObject({ bar: 'foo', one: 1 });
            });
            expect(requests[1].method).toBe('POST');
        });
    });

    describe('addRequestsToQueueInBatches()', () => {
        it('should work', async () => {
            const fakeRequestQueue = {
                requests: [],
                async addRequest(request) {
                    this.requests.push(request);
                },
            };

            const requests = Array(5).fill(null).map((_, i) => i);

            const finished = shared.addRequestsToQueueInBatches(requests, fakeRequestQueue, 2);

            // With batch size 2, two requests will be dispatched synchronously before the async function
            // returns and thus the following push should place 1000 on the third place in the array.
            fakeRequestQueue.requests.push(1000);


            await finished;
            const results = fakeRequestQueue.requests;
            expect(results).toHaveLength(6);
            expect(results[2]).toBe(1000);
            expect(results.reduce((sum, num) => sum + num)).toBe(1010);
        });
    });
});
