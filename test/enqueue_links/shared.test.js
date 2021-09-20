import PseudoUrl from '../../build/pseudo_url';
import { constructPseudoUrlInstances, createRequestOptions, createRequests, addRequestsToQueueInBatches } from '../../build/enqueue_links/shared';

describe('Enqueue links shared functions', () => {
    describe('constructPseudoUrlInstances()', () => {
        test('should work', () => {
            const pseudoUrlSources = [
                new PseudoUrl(/^https?:\/\/example\.com/, { userData: { foo: 'bar' } }),
                /^https?:\/\/example\.com/,
                'http[s?]://example.com/[.*]',
                { purl: 'http[s?]://example.com[.*]', userData: { foo: 'bar' } },
            ];
            const pseudoUrls = constructPseudoUrlInstances(pseudoUrlSources);
            expect(pseudoUrls).toHaveLength(4);
            pseudoUrls.forEach((purl) => {
                expect(purl.matches('https://example.com/foo')).toBe(true);
            });
            let request = pseudoUrls[0].createRequest('https://example.com/foo');
            expect(request.userData).toEqual({ foo: 'bar' });
            request = pseudoUrls[3].createRequest('https://example.com/bar');
            expect(request.userData).toEqual({ foo: 'bar' });
        });

        test('should cache items', () => {
            const pseudoUrls = constructPseudoUrlInstances(['http[s?]://example.com/[.*]']);
            const pseudoUrls2 = constructPseudoUrlInstances(['http[s?]://example.com/[.*]']);
            expect(pseudoUrls[0] === pseudoUrls2[0]).toBe(true);
        });
    });

    describe('createRequests()', () => {
        test('should work', () => {
            const sources = [
                'http://example.com/foo',
                { url: 'https://example.com/bar', method: 'POST' },
                'https://apify.com',
            ];
            const pseudoUrls = [
                new PseudoUrl('http[s?]://example.com/[.*]', { userData: { one: 1 } }),
            ];

            const transformRequestFunction = (request) => {
                request.userData.foo = 'bar';
                return request;
            };

            const requestOptions = createRequestOptions(sources);
            const requests = createRequests(requestOptions, pseudoUrls).map(transformRequestFunction).filter((r) => !!r);

            expect(requests).toHaveLength(2);
            requests.forEach((r) => {
                expect(r.url).toMatch(/^https?:\/\/example\.com\//);
                expect(r.userData).toMatchObject({ foo: 'bar', one: 1 });
            });
            expect(requests[1].method).toBe('POST');
        });
    });

    describe('addRequestsToQueueInBatches()', () => {
        test('should work', async () => {
            const fakeRequestQueue = {
                requests: [],
                async addRequest(request) {
                    this.requests.push(request);
                },
            };

            const requests = Array(5).fill(null).map((_, i) => i);

            const finished = addRequestsToQueueInBatches(requests, fakeRequestQueue, 2);

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
