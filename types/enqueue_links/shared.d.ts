/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function.
 * @param {string[]|Object[]} pseudoUrls
 * @return {PseudoUrl[]}
 * @ignore
 */
export function constructPseudoUrlInstances(pseudoUrls: any[] | string[]): PseudoUrl[];
/**
 * @param {string[]|Object[]} requestOptions
 * @param {PseudoUrl[]} pseudoUrls
 * @return {Request[]}
 * @ignore
 */
export function createRequests(requestOptions: any[] | string[], pseudoUrls: PseudoUrl[]): Request[];
/**
 * @param {string[]|Object[]} sources
 * @param {Object} [userData]
 * @ignore
 */
export function createRequestOptions(sources: any[] | string[], userData?: any): any;
/**
 * @param {Request[]} requests
 * @param {RequestQueue} requestQueue
 * @param {number} batchSize
 * @return {Promise<QueueOperationInfo[]>}
 * @ignore
 */
export function addRequestsToQueueInBatches(requests: Request[], requestQueue: any, batchSize?: number): Promise<any[]>;
/**
 * Takes an Apify {RequestOptions} object and changes it's attributes in a desired way. This user-function is used
 * [`Apify.utils.enqueueLinks`](../api/utils#utils.enqueueLinks) to modify requests before enqueuing them.
 */
export type RequestTransform = (original: any) => any;
import PseudoUrl from "../pseudo_url";
import Request from "../request";
