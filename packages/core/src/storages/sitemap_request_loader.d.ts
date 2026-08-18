import type { BaseHttpClient } from '@crawlee/http-client';
import { EnqueueStrategy, type ParseSitemapOptions } from '@crawlee/utils';
import type { UrlPatternInput } from '../enqueue_links/shared.js';
import { Request } from '../request.js';
import type { IRequestLoader } from './request_loader.js';
import type { IRequestManager } from './request_manager.js';
interface UrlConstraints {
    /**
     * An array of URL patterns that URLs must match to be included.
     *
     * Accepts glob pattern strings, `{ glob: string }` objects, `RegExp` instances, or `{ regexp: RegExp }` objects.
     *
     * Glob matching is always case-insensitive.
     * If you need case-sensitive matching, use a `RegExp`.
     *
     * If `include` is an empty array or `undefined`, then the `SitemapRequestLoader`
     * includes all the URLs from the sitemap.
     */
    include?: readonly UrlPatternInput[];
    /**
     * An array of URL patterns. Matching URLs will **not** be included.
     *
     * Accepts glob pattern strings, `{ glob: string }` objects, `RegExp` instances, or `{ regexp: RegExp }` objects.
     *
     * Glob matching is always case-insensitive.
     * If you need case-sensitive matching, use a `RegExp`.
     */
    exclude?: readonly UrlPatternInput[];
}
export interface SitemapRequestLoaderOptions extends UrlConstraints {
    /**
     * List of sitemap URLs to parse.
     */
    sitemapUrls: string[];
    /**
     * Proxy URL to be used for sitemap loading.
     */
    proxyUrl?: string;
    /**
     * Key for persisting the state of the request list in the `KeyValueStore`.
     */
    persistStateKey?: string;
    /**
     * Persistence-related options to control how and when crawler's data gets persisted.
     */
    persistenceOptions?: {
        /**
         * Use this flag to disable or enable periodic persistence to key value store.
         * @default true
         */
        enable?: boolean;
    };
    /**
     * Abort signal to be used for sitemap loading.
     */
    signal?: AbortSignal;
    /**
     * Timeout for sitemap loading in milliseconds. If both `signal` and `timeoutMillis` are provided, either of them can abort the loading.
     */
    timeoutMillis?: number;
    /**
     * Maximum number of buffered URLs for the sitemap loading stream.
     * If the buffer is full, the stream will pause until the buffer is drained.
     *
     * @default 200
     */
    maxBufferSize?: number;
    /**
     * Keep only sitemap-derived URLs matching this strategy relative to the parent sitemap URL; non-`http(s)`
     * schemes are always dropped. The filtering stays enforced after navigation (e.g. across redirects).
     * Pass `'all'` to disable host filtering.
     * @default EnqueueStrategy.SameHostname
     */
    enqueueStrategy?: EnqueueStrategy | `${EnqueueStrategy}`;
    /**
     * Advanced options for the underlying `parseSitemap` call.
     */
    parseSitemapOptions?: Omit<ParseSitemapOptions, 'emitNestedSitemaps' | 'maxDepth'>;
    /**
     * Custom HTTP client to be used for sitemap loading.
     */
    httpClient?: BaseHttpClient;
}
/**
 * A list of URLs to crawl parsed from a sitemap.
 *
 * The loading of the sitemap is performed in the background so that crawling can start before the sitemap is fully loaded.
 */
export declare class SitemapRequestLoader implements IRequestLoader {
    #private;
    /**
     * Set of URLs that were returned by `fetchNextRequest()` and not marked as handled yet.
     * @internal
     */
    inProgress: Set<string>;
    /** @internal */
    private constructor();
    /**
     * Creates a new object stream with the specified highWaterMark.
     * @param highWaterMark High water mark for the stream (the maximum number of objects the stream will buffer).
     * @returns A new object stream.
     */
    private createNewStream;
    /**
     * Returns a function that checks whether the provided pattern matches the closure URL.
     * @param url URL to be checked.
     * @returns A matcher function that checks whether the pattern matches the closure URL.
     */
    private matchesUrl;
    /**
     * Checks whether the URL matches the `include` / `exclude` patterns provided in the `options`.
     * @param url URL to be checked.
     * @returns `true` if the URL matches the patterns, `false` otherwise.
     */
    private isUrlMatchingPatterns;
    /**
     * Adds a URL to the queue of parsed URLs.
     *
     * Blocks if the stream is full until it is drained.
     */
    private pushNextUrl;
    /**
     * Reads the next URL from the queue of parsed URLs.
     *
     * If the stream is empty, blocks until a new URL is pushed.
     * @returns The next URL from the queue or `null` if we have read all URLs.
     */
    private readNextUrl;
    /**
     * Indicates whether the background processing of sitemap contents has successfully finished.
     *
     * If this is `false`, the background processing is either still in progress or was aborted.
     */
    isSitemapFullyLoaded(): boolean;
    /**
     * Start processing the sitemaps and loading the URLs.
     *
     * Resolves once all the sitemaps URLs have been fully loaded (sets `isSitemapFullyLoaded` to `true`).
     */
    private load;
    /**
     * Open a sitemap and start processing it.
     *
     * Resolves to a new instance of `SitemapRequestLoader`, which **might not be fully loaded yet** - i.e. the sitemap might still be loading in the background.
     *
     * Track the loading progress using the `isSitemapFullyLoaded` property.
     */
    static open(options: SitemapRequestLoaderOptions): Promise<SitemapRequestLoader>;
    /**
     * @inheritDoc
     */
    getTotalCount(): Promise<number>;
    /**
     * @inheritDoc
     */
    getPendingCount(): Promise<number>;
    /**
     * Combines this list with a request manager (a {@apilink RequestQueue} by default) into a
     * {@apilink RequestManagerTandem}, allowing requests to be added and reclaimed while still
     * being read from this list first.
     */
    toTandem(requestManager?: IRequestManager): Promise<IRequestManager>;
    /**
     * @inheritDoc
     */
    isFinished(): Promise<boolean>;
    /**
     * @inheritDoc
     */
    isEmpty(): Promise<boolean>;
    /**
     * @inheritDoc
     */
    getHandledCount(): Promise<number>;
    /**
     * @inheritDoc
     */
    persistState(): Promise<void>;
    private restoreState;
    /**
     * @inheritDoc
     */
    fetchNextRequest(): Promise<Request | null>;
    /**
     * @inheritDoc
     */
    [Symbol.asyncIterator](): AsyncGenerator<Request<import("@crawlee/types").Dictionary>, void, unknown>;
    /**
     * Aborts the internal sitemap loading, stops the processing of the sitemap contents and drops all the pending URLs.
     *
     * Calling `fetchNextRequest()` after this method will always return `null`.
     */
    teardown(): Promise<void>;
    /**
     * @inheritDoc
     */
    markRequestAsHandled(request: Request): Promise<void>;
    private ensureInProgress;
}
export {};
