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
import PseudoUrl from "../pseudo_url";
import Request from "../request";
