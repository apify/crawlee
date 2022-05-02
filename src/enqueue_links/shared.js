import { URL } from 'url';
import _ from 'underscore';
import PseudoUrl from '../pseudo_url';
import Request from '../request'; // eslint-disable-line import/no-duplicates

// TYPES IMPORT
/* eslint-disable no-unused-vars,import/named,import/no-duplicates */
import { RequestQueue, QueueOperationInfo } from '../storages/request_queue';
import { RequestOptions } from '../request';
/* eslint-enable */

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
 * @param {Array<(string|RegExp|{ purl: string|RegExp })>} pseudoUrls
 * @return {Array<PseudoUrl>}
 * @ignore
 */
export function constructPseudoUrlInstances(pseudoUrls) {
    return pseudoUrls.map((item) => {
        // Get pseudoUrl instance from cache.
        let pUrl = enqueueLinksPseudoUrlCache.get(item);
        if (pUrl) return pUrl;

        // Nothing in cache, make a new instance.
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
 * @param {Array<(string|Object)>} requestOptions
 * @param {Array<PseudoUrl>} pseudoUrls
 * @return {Array<Request>}
 * @ignore
 */
export function createRequests(requestOptions, pseudoUrls) {
    if (!(pseudoUrls && pseudoUrls.length)) {
        return requestOptions.map((opts) => new Request(opts));
    }

    const requests = [];
    requestOptions.forEach((opts) => {
        pseudoUrls
            .filter((purl) => purl.matches(opts.url))
            .forEach((purl) => {
                const request = purl.createRequest(opts);
                requests.push(request);
            });
    });
    return requests;
}

/**
 * @param {Array<(string|Object)>} sources
 * @ignore
 */
export function createRequestOptions(sources) {
    return sources
        .map((src) => {
            const reqOpts = typeof src === 'string'
                ? { url: src }
                : src;
            // TODO Remove with v1, there are examples
            // which depend on userData existing here.
            reqOpts.userData = { ...reqOpts.userData };
            return reqOpts;
        })
        .filter(({ url }) => {
            try {
                return new URL(url).href;
            } catch (err) {
                return false;
            }
        });
}

/**
 * @param {Array<Request>} requests
 * @param {RequestQueue} requestQueue
 * @param {number} batchSize
 * @return {Promise<Array<QueueOperationInfo>>}
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
 * {@link utils#enqueueLinks} to modify requests before enqueuing them.
 * @callback RequestTransform
 * @param {RequestOptions} original Request options to be modified.
 * @return {RequestOptions} The modified request options to enqueue.
 */
