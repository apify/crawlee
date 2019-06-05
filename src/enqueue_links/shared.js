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
 * @param {string[]|Object[]} sources
 * @param {PseudoUrl[]} pseudoUrls
 * @param {Object} userData
 * @return {Request[]}
 * @ignore
 */
export function createRequests(sources, pseudoUrls, userData) {
    const normalizedSources = sources
        .map((src) => {
            return typeof src === 'string'
                ? { url: src, userData }
                : { ...src, userData };
        })
        .filter(({ url }) => {
            try {
                return new URL(url).href;
            } catch (err) {
                return false;
            }
        });

    if (!(pseudoUrls && pseudoUrls.length)) {
        return normalizedSources.map(src => new Request(src));
    }

    const requests = [];
    normalizedSources.forEach((src) => {
        pseudoUrls
            .filter(purl => purl.matches(src.url))
            .forEach((purl) => {
                const request = purl.createRequest(src);
                requests.push(request);
            });
    });
    return requests;
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
