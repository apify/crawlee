import type { BatchAddRequestsResult, Dictionary } from '@crawlee/types';

import { checkStorageAccess } from './access_checking';
import type {
    RequestQueueOperationInfo,
    RequestProviderOptions,
    RequestQueueOperationOptions,
} from './request_provider';
import { RequestProvider } from './request_provider';
import { getRequestId } from './utils';
import { Configuration } from '../configuration';
import { EventType } from '../events';
import type { Request, Source } from '../request';

// Double the limit of RequestQueue v1 (1_000_000) as we also store keyed by request.id, not just from uniqueKey
const MAX_CACHED_REQUESTS = 2_000_000;

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
    private listHeadAndLockPromise: Promise<void> | null = null;
    private queueHasLockedRequests: boolean | undefined = undefined;
    private shouldCheckForForefrontRequests = false;
    private dequeuedRequestCount = 0;

    constructor(options: RequestProviderOptions, config = Configuration.getGlobalConfig()) {
        super(
            {
                ...options,
                logPrefix: 'RequestQueue2',
                recentlyHandledRequestsMaxSize: RECENTLY_HANDLED_CACHE_SIZE,
                requestCacheMaxSize: MAX_CACHED_REQUESTS,
            },
            config,
        );

        const eventManager = config.getEventManager();

        eventManager.on(EventType.MIGRATING, async () => {
            await this._clearPossibleLocks();
        });

        eventManager.on(EventType.ABORTING, async () => {
            await this._clearPossibleLocks();
        });
    }

    /**
     * Caches information about request to beware of unneeded addRequest() calls.
     */
    protected override _cacheRequest(cacheKey: string, queueOperationInfo: RequestQueueOperationInfo): void {
        super._cacheRequest(cacheKey, queueOperationInfo);

        this.requestCache.remove(queueOperationInfo.requestId);

        this.requestCache.add(queueOperationInfo.requestId, {
            id: queueOperationInfo.requestId,
            isHandled: queueOperationInfo.wasAlreadyHandled,
            uniqueKey: queueOperationInfo.uniqueKey,
            forefront: queueOperationInfo.forefront,
            hydrated: null,
            lockExpiresAt: null,
        });
    }

    /**
     * @inheritDoc
     */
    override async addRequest(
        requestLike: Source,
        options: RequestQueueOperationOptions = {},
    ): Promise<RequestQueueOperationInfo> {
        const result = await super.addRequest(requestLike, options);
        if (!result.wasAlreadyPresent && options.forefront) {
            this.shouldCheckForForefrontRequests = true;
        }
        return result;
    }

    /**
     * @inheritDoc
     */
    override async addRequests(
        requestsLike: Source[],
        options: RequestQueueOperationOptions = {},
    ): Promise<BatchAddRequestsResult> {
        const result = await super.addRequests(requestsLike, options);
        for (const request of result.processedRequests) {
            if (!request.wasAlreadyPresent && options.forefront) {
                this.shouldCheckForForefrontRequests = true;
                break;
            }
        }
        return result;
    }

    /**
     * @inheritDoc
     */
    override async fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null> {
        checkStorageAccess();

        if (this.queuePausedForMigration) {
            return null;
        }

        this.lastActivity = new Date();

        await this.ensureHeadIsNonEmpty();

        const nextRequestId = this.queueHeadIds.removeFirst();

        // We are likely done at this point.
        if (!nextRequestId) {
            return null;
        }

        const request: Request | null = await this.getOrHydrateRequest(nextRequestId);

        // NOTE: It can happen that the queue head index is inconsistent with the main queue table. This can occur in two situations:

        // 1) Queue head index is ahead of the main table and the request is not present in the main table yet (i.e. getRequest() returned null).
        //    In this case, keep the request marked as in progress for a short while,
        //    so that isFinished() doesn't return true and _ensureHeadIsNonEmpty() doesn't not load the request
        //    into the queueHeadDict straight again. After the interval expires, fetchNextRequest()
        //    will try to fetch this request again, until it eventually appears in the main table.
        if (!request) {
            this.log.debug('Cannot find a request from the beginning of queue or lost lock, will be retried later', {
                nextRequestId,
            });

            return null;
        }

        // 2) Queue head index is behind the main table and the underlying request was already handled
        //    (by some other client, since we keep the track of handled requests in recentlyHandled dictionary).
        //    We just add the request to the recentlyHandled dictionary so that next call to _ensureHeadIsNonEmpty()
        //    will not put the request again to queueHeadDict.
        if (request.handledAt) {
            this.log.debug('Request fetched from the beginning of queue was already handled', { nextRequestId });
            return null;
        }

        this.dequeuedRequestCount += 1;

        return request;
    }

    /**
     * @inheritDoc
     */
    override async markRequestHandled(request: Request): Promise<RequestQueueOperationInfo | null> {
        this.dequeuedRequestCount -= 1;
        return await super.markRequestHandled(request);
    }

    /**
     * @inheritDoc
     */
    override async isFinished(): Promise<boolean> {
        // We are not finished if we're still adding new requests in the background
        if (this.inProgressRequestBatchCount > 0) {
            return false;
        }

        // If the local queue head is non-empty, we don't need to query the "upstream" queue to know we are not finished yet
        if (this.queueHeadIds.length() > 0) {
            return false;
        }

        // Local queue head is empty - try to fetch and lock more requests
        await this.ensureHeadIsNonEmpty();

        // We managed to lock something - we are not finished
        if (this.queueHeadIds.length() > 0) {
            return false;
        }

        // We could not lock any new requests - decide based on whether the queue contains requests locked by another client
        if (this.queueHasLockedRequests !== undefined) {
            // The `% 25` was absolutely arbitrarily picked. It's just to not spam the logs too much.
            if (
                this.queueHasLockedRequests &&
                this.dequeuedRequestCount === 0 &&
                ++this.isFinishedCalledWhileHeadWasNotEmpty % 25 === 0
            ) {
                this.log.info('The queue still contains requests locked by another client');
            }

            return !this.queueHasLockedRequests;
        }

        // The following is a legacy algorithm for checking if the queue is finished. It is used only for request queue clients that do not provide the `queueHasLockedRequests` flag.

        const currentHead = await this.client.listHead({ limit: 2 });

        if (currentHead.items.length === 0) {
            return true;
        }

        // Give users some more concrete info as to why their crawlers seem to be "hanging" doing nothing while we're waiting because the queue is technically
        // not empty. We decided that a queue with elements in its head but that are also locked shouldn't return true in this function.
        // If that ever changes, this function might need a rewrite
        // The `% 25` was absolutely arbitrarily picked. It's just to not spam the logs too much. This is also a very specific path that most crawlers shouldn't hit
        if (++this.isFinishedCalledWhileHeadWasNotEmpty % 25 === 0) {
            const requests = await Promise.all(currentHead.items.map(async (item) => this.client.getRequest(item.id)));

            this.log.info(
                `Queue head still returned requests that need to be processed (or that are locked by other clients)`,
                {
                    requests: requests
                        .map((r) => {
                            if (!r) {
                                return null;
                            }

                            return {
                                id: r.id,
                                lockExpiresAt: r.lockExpiresAt,
                                lockedBy: r.lockByClient,
                            };
                        })
                        .filter(Boolean),
                    clientKey: this.clientKey,
                },
            );
        } else {
            this.log.debug(
                'Queue head still returned requests that need to be processed (or that are locked by other clients)',
                {
                    requestIds: currentHead.items.map((item) => item.id),
                },
            );
        }

        return false;
    }

    /**
     * @inheritDoc
     */
    override async reclaimRequest(
        ...args: Parameters<RequestProvider['reclaimRequest']>
    ): ReturnType<RequestProvider['reclaimRequest']> {
        const res = await super.reclaimRequest(...args);

        if (res) {
            const [request, options] = args;

            if (options?.forefront) {
                this.shouldCheckForForefrontRequests = true;
            }

            // Try to delete the request lock if possible
            try {
                await this.client.deleteRequestLock(request.id!, { forefront: options?.forefront ?? false });
            } catch (err) {
                this.log.debug(`Failed to delete request lock for request ${request.id}`, { err });
            }
        }

        return res;
    }

    protected async ensureHeadIsNonEmpty() {
        checkStorageAccess();

        // Stop fetching if we are paused for migration
        if (this.queuePausedForMigration) {
            return;
        }

        // We want to fetch ahead of time to minimize dead time
        if (this.queueHeadIds.length() > 1 && !this.shouldCheckForForefrontRequests) {
            return;
        }

        this.listHeadAndLockPromise ??= this._listHeadAndLock().finally(() => {
            this.listHeadAndLockPromise = null;
        });

        await this.listHeadAndLockPromise;
    }

    private async giveUpLock(id?: string, uniqueKey?: string) {
        if (id === undefined) {
            return;
        }

        try {
            await this.client.deleteRequestLock(id);
        } catch {
            this.log.debug('Failed to delete request lock', { id, uniqueKey });
        }
    }

    private async _listHeadAndLock(): Promise<void> {
        // Make a copy so that we can clear the flag only if the whole method executes after the flag was set
        // (i.e, it was not set in the middle of the execution of the method)
        const shouldCheckForForefrontRequests = this.shouldCheckForForefrontRequests;

        const limit = 25;

        const headData = await this.client.listAndLockHead({
            limit,
            lockSecs: this.requestLockSecs,
        });

        this.queueHasLockedRequests = headData.queueHasLockedRequests;

        const headIdBuffer = [];
        const forefrontHeadIdBuffer = [];

        for (const { id, uniqueKey } of headData.items) {
            if (!id || !uniqueKey) {
                this.log.warning(
                    `Skipping request from queue head as it's invalid. Please report this with the provided metadata!`,
                    {
                        id,
                        uniqueKey,
                    },
                );

                // Remove the lock from the request for now, so that it can be picked up later
                // This may/may not succeed, but that's fine
                await this.giveUpLock(id, uniqueKey);
                continue;
            }

            // If we remember that we added the request ourselves and we added it to the forefront,
            // we will put it to the beginning of the local queue head to preserve the expected order.
            // If we do not remember that, we will enqueue it normally.
            const forefront = this.requestCache.get(getRequestId(uniqueKey))?.forefront ?? false;
            if (forefront) {
                forefrontHeadIdBuffer.unshift(id);
            } else {
                headIdBuffer.push(id);
            }

            // Ensure that the request is cached locally
            this._cacheRequest(getRequestId(uniqueKey), {
                requestId: id,
                uniqueKey,
                wasAlreadyPresent: true,
                wasAlreadyHandled: false,
                forefront,
            });
        }

        for (const id of headIdBuffer) {
            this.queueHeadIds.add(id, id, false);
        }

        for (const id of forefrontHeadIdBuffer) {
            this.queueHeadIds.add(id, id, true);
        }

        // Unlock and forget requests that would make the local queue head grow over the limit
        const toUnlock = [];
        while (this.queueHeadIds.length() > limit) {
            toUnlock.push(this.queueHeadIds.removeLast()!);
        }

        if (toUnlock.length > 0) {
            await Promise.all(toUnlock.map(async (id) => await this.giveUpLock(id)));
        }

        if (shouldCheckForForefrontRequests) {
            this.shouldCheckForForefrontRequests = false;
        }
    }

    private async getOrHydrateRequest<T extends Dictionary = Dictionary>(
        requestId: string,
    ): Promise<Request<T> | null> {
        checkStorageAccess();

        const cachedEntry = this.requestCache.get(requestId);

        if (!cachedEntry) {
            // 2.1. Attempt to prolong the request lock to see if we still own the request
            const prolongResult = await this._prolongRequestLock(requestId);

            if (!prolongResult) {
                return null;
            }

            // 2.1.1. If successful, hydrate the request and return it
            const hydratedRequest = await this.getRequest(requestId);

            // Queue head index is ahead of the main table and the request is not present in the main table yet (i.e. getRequest() returned null).
            if (!hydratedRequest) {
                // Remove the lock from the request for now, so that it can be picked up later
                // This may/may not succeed, but that's fine
                try {
                    await this.client.deleteRequestLock(requestId);
                } catch {
                    // Ignore
                }

                return null;
            }

            this.requestCache.add(requestId, {
                id: requestId,
                uniqueKey: hydratedRequest.uniqueKey,
                hydrated: hydratedRequest,
                isHandled: hydratedRequest.handledAt !== null,
                lockExpiresAt: prolongResult.getTime(),
                forefront: false,
            });

            return hydratedRequest;
        }

        // 1.1. If hydrated, prolong the lock more and return it
        if (cachedEntry.hydrated) {
            // 1.1.1. If the lock expired on the hydrated requests, try to prolong. If we fail, we lost the request (or it was handled already)
            if (cachedEntry.lockExpiresAt && cachedEntry.lockExpiresAt < Date.now()) {
                const prolonged = await this._prolongRequestLock(cachedEntry.id);

                if (!prolonged) {
                    return null;
                }

                cachedEntry.lockExpiresAt = prolonged.getTime();
            }

            return cachedEntry.hydrated;
        }

        // 1.2. If not hydrated, try to prolong the lock first (to ensure we keep it in our queue), hydrate and return it
        const prolonged = await this._prolongRequestLock(cachedEntry.id);

        if (!prolonged) {
            return null;
        }

        // This might still return null if the queue head is inconsistent with the main queue table.
        const hydratedRequest = await this.getRequest(cachedEntry.id);

        cachedEntry.hydrated = hydratedRequest;

        // Queue head index is ahead of the main table and the request is not present in the main table yet (i.e. getRequest() returned null).
        if (!hydratedRequest) {
            // Remove the lock from the request for now, so that it can be picked up later
            // This may/may not succeed, but that's fine
            try {
                await this.client.deleteRequestLock(cachedEntry.id);
            } catch {
                // Ignore
            }

            return null;
        }

        return hydratedRequest;
    }

    private async _prolongRequestLock(requestId: string): Promise<Date | null> {
        try {
            const res = await this.client.prolongRequestLock(requestId, { lockSecs: this.requestLockSecs });
            return res.lockExpiresAt;
        } catch (err: any) {
            // Most likely we do not own the lock anymore
            this.log.warning(
                `Failed to prolong lock for cached request ${requestId}, either lost the lock or the request was already handled\n`,
                {
                    err,
                },
            );

            return null;
        }
    }

    protected override _reset() {
        super._reset();
        this.listHeadAndLockPromise = null;
        this.queueHasLockedRequests = undefined;
    }

    protected override _maybeAddRequestToQueueHead() {
        // Do nothing for request queue v2, as we are only able to lock requests when listing the head
    }

    protected async _clearPossibleLocks() {
        this.queuePausedForMigration = true;
        let requestId: string | null;

        // eslint-disable-next-line no-cond-assign
        while ((requestId = this.queueHeadIds.removeFirst()) !== null) {
            try {
                await this.client.deleteRequestLock(requestId);
            } catch {
                // We don't have the lock, or the request was never locked. Either way it's fine
            }
        }
    }

    /**
     * @inheritDoc
     */
    static override async open(...args: Parameters<typeof RequestProvider.open>): Promise<RequestQueue> {
        return super.open(...args) as Promise<RequestQueue>;
    }
}
