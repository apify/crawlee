import { URL } from 'url';
import _ from 'underscore';
import { checkParamOrThrow } from 'apify-client/build/utils';
import PseudoUrl from '../pseudo_url';
import Request from '../request';


const MAX_ENQUEUE_LINKS_CACHE_SIZE = 1000;

/**
 * To enable direct use of the Actor UI `pseudoUrls` output while keeping high performance,
 * all the pseudoUrls from the output are only constructed once and kept in a cache
 * by the `enqueueLinks()` function.
 * @ignore
 */
const enqueueLinksPseudoUrlCache = new Map();

/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function.
 * @param {string[]|Object[]} pseudoUrls
 * @return {PseudoUrl[]}
 * @ignore
 */
export function constructPseudoUrlInstances(pseudoUrls) {
    return pseudoUrls.map((item, idx) => {
        // Get pseudoUrl instance from cache.
        let pUrl = enqueueLinksPseudoUrlCache.get(item);
        if (pUrl) return pUrl;
        // Nothing in cache, make a new instance.
        checkParamOrThrow(item, `pseudoUrls[${idx}]`, 'RegExp|Object|String');

        // If it's already a PseudoURL, just save it.
        if (item instanceof PseudoUrl) pUrl = item;
        // If it's a string or RegExp, construct a PURL from it directly.
        else if (typeof item === 'string' || item instanceof RegExp) pUrl = new PseudoUrl(item);
        // If it's an object, look for a purl property and use it and the rest to construct a PURL with a Request template.
        else pUrl = new PseudoUrl(item.purl, _.omit(item, 'purl'));

        // Manage cache
        enqueueLinksPseudoUrlCache.set(item, pUrl);
        if (enqueueLinksPseudoUrlCache.size > MAX_ENQUEUE_LINKS_CACHE_SIZE) {
            const key = enqueueLinksPseudoUrlCache.keys().next().value;
            enqueueLinksPseudoUrlCache.delete(key);
        }
        return pUrl;
    });
}
/**
 * @param {string[]|Object[]} requestOptions
 * @param {PseudoUrl[]} pseudoUrls
 * @return {Request[]}
 * @ignore
 */
export function createRequests(requestOptions, pseudoUrls) {
    if (!(pseudoUrls && pseudoUrls.length)) {
        return requestOptions.map(opts => new Request(opts));
    }

    const requests = [];
    requestOptions.forEach((opts) => {
        pseudoUrls
            .filter(purl => purl.matches(opts.url))
            .forEach((purl) => {
                const request = purl.createRequest(opts);
                requests.push(request);
            });
    });
    return requests;
}

/**
 * @param {string[]|Object[]} sources
 * @param {Object} [userData]
 * @ignore
 */
export function createRequestOptions(sources, userData = {}) {
    return sources
        .map(src => (typeof src === 'string' ? { url: src } : src))
        .filter(({ url }) => {
            try {
                return new URL(url).href;
            } catch (err) {
                return false;
            }
        })
        .map((rqOpts) => {
            rqOpts.userData = { ...rqOpts.userData, ...userData };
            return rqOpts;
        });
}

/**
 * @param {Request[]} requests
 * @param {RequestQueue} requestQueue
 * @param {number} batchSize
 * @return {Promise<QueueOperationInfo[]>}
 * @ignore
 */
export async function addRequestsToQueueInBatches(requests, requestQueue, batchSize = 5) {
    const queueOperationInfos = [];
    for (const request of requests) {
        queueOperationInfos.push(requestQueue.addRequest(request));
        if (queueOperationInfos.length % batchSize === 0) await Promise.all(queueOperationInfos);
    }
    return Promise.all(queueOperationInfos);
}

/**
 * Takes an Apify {RequestOptions} object and changes it's attributes in a desired way. This user-function is used
 * [`Apify.utils.enqueueLinks`](../api/utils#utils.enqueueLinks) to modify requests before enqueuing them.
 * @callback RequestTransform
 * @param {RequestOptions} original Request options to be modified.
 * @return {RequestOptions} The modified request options to enqueue.
 */
