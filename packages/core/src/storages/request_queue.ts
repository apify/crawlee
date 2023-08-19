import { setTimeout as sleep } from 'node:timers/promises';

import { REQUEST_QUEUE_HEAD_MAX_LIMIT } from '@apify/consts';
import type { Dictionary,
} from '@crawlee/types';

import type { RequestProviderOptions } from './request_provider';
import { RequestProvider } from './request_provider';
import {
    API_PROCESSED_REQUESTS_DELAY_MILLIS,
    MAX_QUERIES_FOR_CONSISTENCY,
    QUERY_HEAD_BUFFER,
    QUERY_HEAD_MIN_LENGTH,
    STORAGE_CONSISTENCY_DELAY_MILLIS,
    getRequestId,
} from './utils';
import { Configuration } from '../configuration';
import type { Request } from '../request';

const MAX_CACHED_REQUESTS = 1_000_000;

/**
 * This number must be large enough so that processing of all these requests cannot be done in
 * a time lower than expected maximum latency of DynamoDB, but low enough not to waste too much memory.
 * @internal
 */
const RECENTLY_HANDLED_CACHE_SIZE = 1000;

/**
 * Represents a queue of URLs to crawl, which is used for deep crawling of websites
 * where you start with several URLs and then recursively
 * follow links to other pages. The data structure supports both breadth-first and depth-first crawling orders.
 *
 * Each URL is represented using an instance of the {@apilink Request} class.
 * The queue can only contain unique URLs. More precisely, it can only contain {@apilink Request} instances
 * with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden.
 * To add a single URL multiple times to the queue,
 * corresponding {@apilink Request} objects will need to have different `uniqueKey` properties.
 *
 * Do not instantiate this class directly, use the {@apilink RequestQueue.open} function instead.
 *
 * `RequestQueue` is used by {@apilink BasicCrawler}, {@apilink CheerioCrawler}, {@apilink PuppeteerCrawler}
 * and {@apilink PlaywrightCrawler} as a source of URLs to crawl.
 * Unlike {@apilink RequestList}, `RequestQueue` supports dynamic adding and removing of requests.
 * On the other hand, the queue is not optimized for operations that add or remove a large number of URLs in a batch.
 *
 * `RequestQueue` stores its data either on local disk or in the Apify Cloud,
 * depending on whether the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment variable is set.
 *
 * If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the queue data is stored in
 * that directory in an SQLite database file.
 *
 * If the `APIFY_TOKEN` environment variable is set but `APIFY_LOCAL_STORAGE_DIR` is not, the data is stored in the
 * [Apify Request Queue](https://docs.apify.com/storage/request-queue)
 * cloud storage. Note that you can force usage of the cloud storage also by passing the `forceCloud`
 * option to {@apilink RequestQueue.open} function,
 * even if the `APIFY_LOCAL_STORAGE_DIR` variable is set.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Open the default request queue associated with the crawler run
 * const queue = await RequestQueue.open();
 *
 * // Open a named request queue
 * const queueWithName = await RequestQueue.open('some-name');
 *
 * // Enqueue few requests
 * await queue.addRequest({ url: 'http://example.com/aaa' });
 * await queue.addRequest({ url: 'http://example.com/bbb' });
 * await queue.addRequest({ url: 'http://example.com/foo/bar' }, { forefront: true });
 * ```
 * @category Sources
 */
export class RequestQueue extends RequestProvider {
    private queryQueueHeadPromise?: Promise<{
        wasLimitReached: boolean;
        prevLimit: number;
        queueModifiedAt: Date;
        queryStartedAt: Date;
        hadMultipleClients?: boolean;
    }> | null = null;

    /**
     * @internal
     */
    constructor(options: RequestProviderOptions, config = Configuration.getGlobalConfig()) {
        super({
            ...options,
            logPrefix: 'RequestQueue',
            recentlyHandledRequestsMaxSize: RECENTLY_HANDLED_CACHE_SIZE,
            requestCacheMaxSize: MAX_CACHED_REQUESTS,
        }, config);
    }

    /**
     * Returns a next request in the queue to be processed, or `null` if there are no more pending requests.
     *
     * Once you successfully finish processing of the request, you need to call
     * {@apilink RequestQueue.markRequestHandled}
     * to mark the request as handled in the queue. If there was some error in processing the request,
     * call {@apilink RequestQueue.reclaimRequest} instead,
     * so that the queue will give the request to some other consumer in another call to the `fetchNextRequest` function.
     *
     * Note that the `null` return value doesn't mean the queue processing finished,
     * it means there are currently no pending requests.
     * To check whether all requests in queue were finished,
     * use {@apilink RequestQueue.isFinished} instead.
     *
     * @returns
     *   Returns the request object or `null` if there are no more pending requests.
     */
    override async fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null> {
        await this._ensureHeadIsNonEmpty();

        const nextRequestId = this.queueHeadIds.removeFirst();

        // We are likely done at this point.
        if (!nextRequestId) return null;

        // This should never happen, but...
        if (this.requestIdsInProgress.has(nextRequestId) || this.recentlyHandledRequestsCache.get(nextRequestId)) {
            this.log.warning('Queue head returned a request that is already in progress?!', {
                nextRequestId,
                inProgress: this.requestIdsInProgress.has(nextRequestId),
                recentlyHandled: !!this.recentlyHandledRequestsCache.get(nextRequestId),
            });
            return null;
        }

        this.requestIdsInProgress.add(nextRequestId);
        this.lastActivity = new Date();

        let request;
        try {
            request = await this.getRequest(nextRequestId);
        } catch (e) {
            // On error, remove the request from in progress, otherwise it would be there forever
            this.requestIdsInProgress.delete(nextRequestId);
            throw e;
        }

        // NOTE: It can happen that the queue head index is inconsistent with the main queue table. This can occur in two situations:

        // 1) Queue head index is ahead of the main table and the request is not present in the main table yet (i.e. getRequest() returned null).
        //    In this case, keep the request marked as in progress for a short while,
        //    so that isFinished() doesn't return true and _ensureHeadIsNonEmpty() doesn't not load the request
        //    into the queueHeadDict straight again. After the interval expires, fetchNextRequest()
        //    will try to fetch this request again, until it eventually appears in the main table.
        if (!request) {
            this.log.debug('Cannot find a request from the beginning of queue, will be retried later', { nextRequestId });
            setTimeout(() => {
                this.requestIdsInProgress.delete(nextRequestId);
            }, STORAGE_CONSISTENCY_DELAY_MILLIS);
            return null;
        }

        // 2) Queue head index is behind the main table and the underlying request was already handled
        //    (by some other client, since we keep the track of handled requests in recentlyHandled dictionary).
        //    We just add the request to the recentlyHandled dictionary so that next call to _ensureHeadIsNonEmpty()
        //    will not put the request again to queueHeadDict.
        if (request.handledAt) {
            this.log.debug('Request fetched from the beginning of queue was already handled', { nextRequestId });
            this.recentlyHandledRequestsCache.add(nextRequestId, true);
            return null;
        }

        return request;
    }

    protected override async ensureHeadIsNonEmpty(): Promise<void> {
        // Alias for backwards compatibility
        await this._ensureHeadIsNonEmpty();
    }

    /**
     * We always request more items than is in progress to ensure that something falls into head.
     *
     * @param [ensureConsistency] If true then query for queue head is retried until queueModifiedAt
     *   is older than queryStartedAt by at least API_PROCESSED_REQUESTS_DELAY_MILLIS to ensure that queue
     *   head is consistent.
     * @default false
     * @param [limit] How many queue head items will be fetched.
     * @param [iteration] Used when this function is called recursively to limit the recursion.
     * @returns Indicates if queue head is consistent (true) or inconsistent (false).
     */
    protected async _ensureHeadIsNonEmpty(
        ensureConsistency = false,
        limit = Math.max(this.inProgressCount() * QUERY_HEAD_BUFFER, QUERY_HEAD_MIN_LENGTH),
        iteration = 0,
    ): Promise<boolean> {
        // If is nonempty resolve immediately.
        if (this.queueHeadIds.length() > 0) return true;

        if (!this.queryQueueHeadPromise) {
            const queryStartedAt = new Date();

            this.queryQueueHeadPromise = this.client
                .listHead({ limit })
                .then(({ items, queueModifiedAt, hadMultipleClients }) => {
                    items.forEach(({ id: requestId, uniqueKey }) => {
                        // Queue head index might be behind the main table, so ensure we don't recycle requests
                        if (!requestId || !uniqueKey || this.requestIdsInProgress.has(requestId) || this.recentlyHandledRequestsCache.get(requestId!)) return;

                        this.queueHeadIds.add(requestId, requestId, false);
                        this._cacheRequest(getRequestId(uniqueKey), {
                            requestId,
                            wasAlreadyHandled: false,
                            wasAlreadyPresent: true,
                            uniqueKey,
                        });
                    });

                    // This is needed so that the next call to _ensureHeadIsNonEmpty() will fetch the queue head again.
                    this.queryQueueHeadPromise = null;

                    return {
                        wasLimitReached: items.length >= limit,
                        prevLimit: limit,
                        queueModifiedAt: new Date(queueModifiedAt),
                        queryStartedAt,
                        hadMultipleClients,
                    };
                });
        }

        const { queueModifiedAt, wasLimitReached, prevLimit, queryStartedAt, hadMultipleClients } = await this.queryQueueHeadPromise;

        // TODO: I feel this code below can be greatly simplified...

        // If queue is still empty then one of the following holds:
        // - the other calls waiting for this promise already consumed all the returned requests
        // - the limit was too low and contained only requests in progress
        // - the writes from other clients were not propagated yet
        // - the whole queue was processed and we are done

        // If limit was not reached in the call then there are no more requests to be returned.
        if (prevLimit >= REQUEST_QUEUE_HEAD_MAX_LIMIT) {
            this.log.warning(`Reached the maximum number of requests in progress: ${REQUEST_QUEUE_HEAD_MAX_LIMIT}.`);
        }
        const shouldRepeatWithHigherLimit = this.queueHeadIds.length() === 0
            && wasLimitReached
            && prevLimit < REQUEST_QUEUE_HEAD_MAX_LIMIT;

        // If ensureConsistency=true then we must ensure that either:
        // - queueModifiedAt is older than queryStartedAt by at least API_PROCESSED_REQUESTS_DELAY_MILLIS
        // - hadMultipleClients=false and this.assumedTotalCount<=this.assumedHandledCount
        const isDatabaseConsistent = +queryStartedAt - +queueModifiedAt >= API_PROCESSED_REQUESTS_DELAY_MILLIS;
        const isLocallyConsistent = !hadMultipleClients && this.assumedTotalCount <= this.assumedHandledCount;
        // Consistent information from one source is enough to consider request queue finished.
        const shouldRepeatForConsistency = ensureConsistency && !isDatabaseConsistent && !isLocallyConsistent;

        // If both are false then head is consistent and we may exit.
        if (!shouldRepeatWithHigherLimit && !shouldRepeatForConsistency) return true;

        // If we are querying for consistency then we limit the number of queries to MAX_QUERIES_FOR_CONSISTENCY.
        // If this is reached then we return false so that empty() and finished() returns possibly false negative.
        if (!shouldRepeatWithHigherLimit && iteration > MAX_QUERIES_FOR_CONSISTENCY) return false;

        const nextLimit = shouldRepeatWithHigherLimit
            ? Math.round(prevLimit * 1.5)
            : prevLimit;

        // If we are repeating for consistency then wait required time.
        if (shouldRepeatForConsistency) {
            const delayMillis = API_PROCESSED_REQUESTS_DELAY_MILLIS - (Date.now() - +queueModifiedAt);
            this.log.info(`Waiting for ${delayMillis}ms before considering the queue as finished to ensure that the data is consistent.`);
            await sleep(delayMillis);
        }

        return this._ensureHeadIsNonEmpty(ensureConsistency, nextLimit, iteration + 1);
    }

    // TODO: This needs to be adapted in a way that it is agnostic to the request queue api we use.
    // For the sake of having something, we'll just list the head normally and check if it's empty.
    override async isFinished(): Promise<boolean> {
        if ((Date.now() - +this.lastActivity) > this.internalTimeoutMillis) {
            const message = `The request queue seems to be stuck for ${this.internalTimeoutMillis / 1e3}s, resetting internal state.`;
            this.log.warning(message, { inProgress: [...this.requestIdsInProgress] });
            this._reset();
        }

        if (this.queueHeadIds.length() > 0 || this.inProgressCount() > 0) return false;

        const isHeadConsistent = await this._ensureHeadIsNonEmpty(true);
        return isHeadConsistent && this.queueHeadIds.length() === 0 && this.inProgressCount() === 0;
    }
}
