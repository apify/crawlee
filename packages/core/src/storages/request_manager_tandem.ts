import type { Dictionary } from '@crawlee/types';

import type { CrawleeLogger } from '../log.js';
import type { Request, Source } from '../request.js';
import { serviceLocator } from '../service_locator.js';
import type { IRequestLoader } from './request_loader.js';
import type { IRequestManager, RequestsLike } from './request_manager.js';
import type {
    AddRequestsBatchedOptions,
    AddRequestsBatchedResult,
    RequestQueueOperationInfo,
    RequestQueueOperationOptions,
} from './request_queue.js';

/**
 * A request manager that combines a {@apilink IRequestLoader} (such as a `RequestList`) with a writable
 * {@apilink IRequestManager} (such as a `RequestQueue`).
 * It first reads requests from the loader and then, when needed, transfers them in batches to the manager.
 */
export class RequestManagerTandem implements IRequestManager {
    private log: CrawleeLogger;
    private requestLoader: IRequestLoader;
    private requestManagerPromise?: Promise<IRequestManager>;
    private resolvedRequestManager?: IRequestManager;

    private requestManagerFactory: () => IRequestManager | Promise<IRequestManager>;

    /**
     * @param requestLoader The read-only loader to read requests from first.
     * @param requestManager The writable manager to transfer requests into and enqueue new ones. May be passed as a
     *  factory function so that the tandem can be constructed synchronously and the manager opened lazily on first use
     *  (e.g. a lazily-opened default {@apilink RequestQueue}).
     */
    constructor(
        requestLoader: IRequestLoader,
        requestManager: IRequestManager | (() => IRequestManager | Promise<IRequestManager>),
    ) {
        this.log = serviceLocator.getLogger().child({ prefix: 'RequestManagerTandem' });
        this.requestLoader = requestLoader;
        this.requestManagerFactory = typeof requestManager === 'function' ? requestManager : () => requestManager;
    }

    /**
     * Resolves the writable request manager, opening it lazily (via the factory) on first use and memoizing the result.
     * @private
     */
    private async getRequestManager(): Promise<IRequestManager> {
        if (this.resolvedRequestManager === undefined) {
            this.requestManagerPromise ??= Promise.resolve(this.requestManagerFactory());
            this.resolvedRequestManager = await this.requestManagerPromise;
        }
        return this.resolvedRequestManager;
    }

    /**
     * Transfers a single request from the read-only loader to the writable manager.
     * If the transfer fails, the request is dropped (and logged) rather than reclaimed.
     *
     * @returns `true` if a request was successfully transferred (or there was nothing to transfer), and `false` if a
     *  transfer was attempted but failed - in which case the caller should not fetch from the manager this round.
     * @private
     */
    private async transferNextRequestToQueue(): Promise<boolean> {
        const request = await this.requestLoader.fetchNextRequest();

        if (request === null) {
            return true;
        }

        const requestManager = await this.getRequestManager();

        try {
            await requestManager.addRequest(request, { forefront: true });
            return true;
        } catch (error) {
            this.log.exception(
                error as Error,
                'Adding request from the RequestLoader to the RequestManager failed, the request has been dropped.',
                { url: request.url, uniqueKey: request.uniqueKey },
            );
            return false;
        } finally {
            // Mark it as handled so that the request doesn't get stuck in the `inProgress` state in the loader.
            await this.requestLoader.markRequestHandled(request);
        }
    }

    /**
     * Fetches the next request from the request manager. If the manager is empty and the loader
     * is not finished, it will transfer a request from the loader to the manager first.
     * @inheritdoc
     */
    async fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null> {
        // First, try to transfer a request from the requestList
        const [listEmpty, listFinished] = await Promise.all([
            this.requestLoader.isEmpty(),
            this.requestLoader.isFinished(),
        ]);

        if (!listEmpty && !listFinished) {
            // If the transfer failed, the request was dropped; don't fetch from the manager this round (matching
            // crawlee-python behaviour). The next `fetchNextRequest()` call will pick up where we left off.
            if (!(await this.transferNextRequestToQueue())) {
                return null;
            }
        }

        // Try to fetch from manager after the transfer
        return (await this.getRequestManager()).fetchNextRequest<T>();
    }

    /**
     * @inheritdoc
     */
    async isFinished(): Promise<boolean> {
        const requestManager = await this.getRequestManager();
        const storagesFinished = await Promise.all([this.requestLoader.isFinished(), requestManager.isFinished()]);
        return storagesFinished.every(Boolean);
    }

    /**
     * @inheritdoc
     */
    async isEmpty(): Promise<boolean> {
        const requestManager = await this.getRequestManager();
        const storagesEmpty = await Promise.all([this.requestLoader.isEmpty(), requestManager.isEmpty()]);
        return storagesEmpty.every(Boolean);
    }

    /**
     * @inheritdoc
     */
    async getHandledCount(): Promise<number> {
        // Since one of the stores needs to have priority when both are present, we query the request manager - the request loader will first be dumped into the manager and then left empty.
        return (await this.getRequestManager()).getHandledCount();
    }

    /**
     * @inheritdoc
     */
    async getTotalCount(): Promise<number> {
        const requestManager = await this.getRequestManager();
        const [managerTotal, loaderTotal] = await Promise.all([
            requestManager.getTotalCount(),
            this.requestLoader.getTotalCount(),
        ]);
        return managerTotal + loaderTotal;
    }

    /**
     * @inheritdoc
     */
    async getPendingCount(): Promise<number> {
        const requestManager = await this.getRequestManager();
        const [managerPending, loaderPending] = await Promise.all([
            requestManager.getPendingCount(),
            this.requestLoader.getPendingCount(),
        ]);
        return managerPending + loaderPending;
    }

    /**
     * @inheritdoc
     */
    async *[Symbol.asyncIterator]() {
        while (true) {
            const req = await this.fetchNextRequest();
            if (!req) break;
            yield req;
        }
    }

    /**
     * @inheritdoc
     */
    async markRequestHandled(request: Request): Promise<RequestQueueOperationInfo | void | null> {
        return (await this.getRequestManager()).markRequestHandled(request);
    }

    /**
     * @inheritdoc
     */
    async reclaimRequest(
        request: Request,
        options?: RequestQueueOperationOptions,
    ): Promise<RequestQueueOperationInfo | null> {
        return (await this.getRequestManager()).reclaimRequest(request, options);
    }

    /**
     * @inheritdoc
     */
    async addRequest(requestLike: Source, options?: RequestQueueOperationOptions): Promise<RequestQueueOperationInfo> {
        return (await this.getRequestManager()).addRequest(requestLike, options);
    }

    /**
     * @inheritdoc
     */
    async addRequestsBatched(
        requests: RequestsLike,
        options?: AddRequestsBatchedOptions,
    ): Promise<AddRequestsBatchedResult> {
        return (await this.getRequestManager()).addRequestsBatched(requests, options);
    }

    /**
     * Persists the state of the underlying read-only loader, if it supports persistence.
     * @inheritdoc
     */
    async persistState(): Promise<void> {
        await this.requestLoader.persistState?.();
    }

    /**
     * Purges the writable request manager so the tandem can be reused (e.g. across repeated `crawler.run()` calls).
     * The read-only loader is immutable and cannot be purged, so only the manager side is reset.
     * @inheritdoc
     */
    async purge(): Promise<void> {
        await (await this.getRequestManager()).purge?.();
    }
}
