/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function.
 * @param {Array<(string|Object)>} pseudoUrls
 * @return {Array<PseudoUrl>}
 * @ignore
 */
export function constructPseudoUrlInstances(pseudoUrls: (string | Object)[]): PseudoUrl[];
/**
 * @param {Array<(string|Object)>} requestOptions
 * @param {Array<PseudoUrl>} pseudoUrls
 * @return {Array<Request>}
 * @ignore
 */
export function createRequests(requestOptions: (string | Object)[], pseudoUrls: PseudoUrl[]): Request[];
/**
 * @param {Array<(string|Object)>} sources
 * @param {Object} [userData]
 * @ignore
 */
export function createRequestOptions(sources: (string | Object)[], userData?: Object | undefined): (Object | {
    url: string;
})[];
/**
 * @param {Array<Request>} requests
 * @param {RequestQueue} requestQueue
 * @param {number} batchSize
 * @return {Promise<Array<QueueOperationInfo>>}
 * @ignore
 */
export function addRequestsToQueueInBatches(requests: Request[], requestQueue: RequestQueue, batchSize?: number): Promise<QueueOperationInfo[]>;
/**
 * Takes an Apify {RequestOptions} object and changes it's attributes in a desired way. This user-function is used
 * {@link utils#enqueueLinks} to modify requests before enqueuing them.
 */
export type RequestTransform = (original: RequestOptions) => RequestOptions;
import PseudoUrl from "../pseudo_url";
import Request from "../request";
import { RequestQueue } from "../request_queue";
import { QueueOperationInfo } from "../request_queue";
import { RequestOptions } from "../request";
