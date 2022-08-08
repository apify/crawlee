import { downloadListOfUrls } from '@crawlee/utils';
import type { Dictionary } from '@crawlee/types';
import ow, { ArgumentError } from 'ow';
import type { EventManager } from '../events';
import { EventType } from '../events';
import { Configuration } from '../configuration';
import { log } from '../log';
import type { RequestOptions } from '../request';
import { Request } from '../request';
import { createDeserialize, serializeArray } from '../serialization';
import { KeyValueStore } from './key_value_store';
import type { ProxyConfiguration } from '../proxy_configuration';
import { purgeDefaultStorages } from './utils';

/** @internal */
export const STATE_PERSISTENCE_KEY = 'REQUEST_LIST_STATE';

/** @internal */
export const REQUESTS_PERSISTENCE_KEY = 'REQUEST_LIST_REQUESTS';

const CONTENT_TYPE_BINARY = 'application/octet-stream';

export interface RequestListOptions {
    /**
     * An array of sources of URLs for the {@apilink RequestList}. It can be either an array of strings,
     * plain objects that define at least the `url` property, or an array of {@apilink Request} instances.
     *
     * **IMPORTANT:** The `sources` array will be consumed (left empty) after `RequestList` initializes.
     * This is a measure to prevent memory leaks in situations when millions of sources are
     * added.
     *
     * Additionally, the `requestsFromUrl` property may be used instead of `url`,
     * which will instruct `RequestList` to download the source URLs from a given remote location.
     * The URLs will be parsed from the received response.
     *
     * ```
     * [
     *     // A single URL
     *     'http://example.com/a/b',
     *
     *     // Modify Request options
     *     { method: PUT, 'https://example.com/put, payload: { foo: 'bar' }}
     *
     *     // Batch import of URLs from a file hosted on the web,
     *     // where the URLs should be requested using the HTTP POST request
     *     { method: 'POST', requestsFromUrl: 'http://example.com/urls.txt' },
     *
     *     // Batch import from remote file, using a specific regular expression to extract the URLs.
     *     { requestsFromUrl: 'http://example.com/urls.txt', regex: /https:\/\/example.com\/.+/ },
     *
     *     // Get list of URLs from a Google Sheets document. Just add "/gviz/tq?tqx=out:csv" to the Google Sheet URL.
     *     // For details, see https://help.apify.com/en/articles/2906022-scraping-a-list-of-urls-from-a-google-sheets-document
     *     { requestsFromUrl: 'https://docs.google.com/spreadsheets/d/1GA5sSQhQjB_REes8I5IKg31S-TuRcznWOPjcpNqtxmU/gviz/tq?tqx=out:csv' }
     * ]
     * ```
     */
    sources?: Source[];

    /**
     * A function that will be called to get the sources for the `RequestList`, but only if `RequestList`
     * was not able to fetch their persisted version (see {@apilink RequestListOptions.persistRequestsKey}).
     * It must return an `Array` of {@apilink Request} or {@apilink RequestOptions}.
     *
     * This is very useful in a scenario when getting the sources is a resource intensive or time consuming
     * task, such as fetching URLs from multiple sitemaps or parsing URLs from large datasets. Using the
     * `sourcesFunction` in combination with `persistStateKey` and `persistRequestsKey` will allow you to
     * fetch and parse those URLs only once, saving valuable time when your crawler migrates or restarts.
     *
     * If both {@apilink RequestListOptions.sources} and {@apilink RequestListOptions.sourcesFunction} are provided,
     * the sources returned by the function will be added after the `sources`.
     *
     * **Example:**
     * ```javascript
     * // Let's say we want to scrape URLs extracted from sitemaps.
     *
     * const sourcesFunction = async () => {
     *     // With super large sitemaps, this operation could take very long
     *     // and big websites typically have multiple sitemaps.
     *     const sitemaps = await downloadHugeSitemaps();
     *     return parseUrlsFromSitemaps(sitemaps);
     * };
     *
     * // Sitemaps can change in real-time, so it's important to persist
     * // the URLs we collected. Otherwise we might lose our scraping
     * // state in case of an crawler migration / failure / time-out.
     * const requestList = await RequestList.open(null, [], {
     *     // The sourcesFunction is called now and the Requests are persisted.
     *     // If something goes wrong and we need to start again, RequestList
     *     // will load the persisted Requests from storage and will NOT
     *     // call the sourcesFunction again, saving time and resources.
     *     sourcesFunction,
     *     persistStateKey: 'state-key',
     *     persistRequestsKey: 'requests-key',
     * })
     * ```
     */
    sourcesFunction?: RequestListSourcesFunction;

    /**
    *   Used to pass the the proxy configuration for the `requestsFromUrls` objects.
    *   Takes advantage of the internal address rotation and authentication process.
    *   If undefined, the `requestsFromUrls` requests will be made without proxy.
    */
    proxyConfiguration?: ProxyConfiguration;

    /**
     * Identifies the key in the default key-value store under which `RequestList` periodically stores its
     * state (i.e. which URLs were crawled and which not).
     * If the crawler is restarted, `RequestList` will read the state
     * and continue where it left off.
     *
     * If `persistStateKey` is not set, `RequestList` will always start from the beginning,
     * and all the source URLs will be crawled again.
     */
    persistStateKey?: string;

    /**
     * Identifies the key in the default key-value store under which the `RequestList` persists its
     * Requests during the {@apilink RequestList.initialize} call.
     * This is necessary if `persistStateKey` is set and the source URLs might potentially change,
     * to ensure consistency of the source URLs and state object. However, it comes with some
     * storage and performance overheads.
     *
     * If `persistRequestsKey` is not set, {@apilink RequestList.initialize} will always fetch the sources
     * from their origin, check that they are consistent with the restored state (if any)
     * and throw an error if they are not.
     */
    persistRequestsKey?: string;

    /**
     * The state object that the `RequestList` will be initialized from.
     * It is in the form as returned by `RequestList.getState()`, such as follows:
     *
     * ```
     * {
     *     nextIndex: 5,
     *     nextUniqueKey: 'unique-key-5'
     *     inProgress: {
     *       'unique-key-1': true,
     *       'unique-key-4': true,
     *     },
     * }
     * ```
     *
     * Note that the preferred (and simpler) way to persist the state of crawling of the `RequestList`
     * is to use the `stateKeyPrefix` parameter instead.
     */
    state?: RequestListState;

    /**
     * By default, `RequestList` will deduplicate the provided URLs. Default deduplication is based
     * on the `uniqueKey` property of passed source {@apilink Request} objects.
     *
     * If the property is not present, it is generated by normalizing the URL. If present, it is kept intact.
     * In any case, only one request per `uniqueKey` is added to the `RequestList` resulting in removal
     * of duplicate URLs / unique keys.
     *
     * Setting `keepDuplicateUrls` to `true` will append an additional identifier to the `uniqueKey`
     * of each request that does not already include a `uniqueKey`. Therefore, duplicate
     * URLs will be kept in the list. It does not protect the user from having duplicates in user set
     * `uniqueKey`s however. It is the user's responsibility to ensure uniqueness of their unique keys
     * if they wish to keep more than just a single copy in the `RequestList`.
     * @default false
     */
    keepDuplicateUrls?: boolean;

    /** @internal */
    config?: Configuration;
}

/**
 * Represents a static list of URLs to crawl.
 * The URLs can be provided either in code or parsed from a text file hosted on the web.
 * `RequestList` is used by {@apilink BasicCrawler}, {@apilink CheerioCrawler}, {@apilink PuppeteerCrawler}
 * and {@apilink PlaywrightCrawler} as a source of URLs to crawl.
 *
 * Each URL is represented using an instance of the {@apilink Request} class.
 * The list can only contain unique URLs. More precisely, it can only contain `Request` instances
 * with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden.
 * To add a single URL to the list multiple times, corresponding {@apilink Request} objects will need to have different
 * `uniqueKey` properties. You can use the `keepDuplicateUrls` option to do this for you when initializing the
 * `RequestList` from sources.
 *
 * Once you create an instance of `RequestList`, you need to call the {@apilink RequestList.initialize} function
 * before the instance can be used. After that, no more URLs can be added to the list.
 * Unlike {@apilink RequestQueue}, `RequestList` is static but it can contain even millions of URLs.
 * > Note that `RequestList` can be used together with `RequestQueue` by the same crawler.
 * > In such cases, each request from `RequestList` is enqueued into `RequestQueue` first and then consumed from the latter.
 * > This is necessary to avoid the same URL being processed more than once (from the list first and then possibly from the queue).
 * > In practical terms, such a combination can be useful when there is a large number of initial URLs,
 * > but more URLs would be added dynamically by the crawler.
 *
 * `RequestList` has an internal state where it stores information about which requests were already handled,
 * which are in progress and which were reclaimed. The state may be automatically persisted to the default
 * {@apilink KeyValueStore} by setting the `persistStateKey` option so that if the Node.js process is restarted,
 * the crawling can continue where it left off. The automated persisting is launched upon receiving the `persistState`
 * event that is periodically emitted by {@apilink EventManager}.
 *
 * The internal state is closely tied to the provided sources (URLs). If the sources change on crawler restart, the state will become corrupted and
 * `RequestList` will raise an exception. This typically happens when the sources is a list of URLs downloaded from the web.
 * In such case, use the `persistRequestsKey` option in conjunction with `persistStateKey`,
 * to make the `RequestList` store the initial sources to the default key-value store and load them after restart,
 * which will prevent any issues that a live list of URLs might cause.
 *
 * **Basic usage:**
 * ```javascript
 * // Use a helper function to simplify request list initialization.
 * // State and sources are automatically persisted. This is a preferred usage.
 * const requestList = await RequestList.open('my-request-list', [
 *     'http://www.example.com/page-1',
 *     { url: 'http://www.example.com/page-2', method: 'POST', userData: { foo: 'bar' }},
 *     { requestsFromUrl: 'http://www.example.com/my-url-list.txt', userData: { isFromUrl: true } },
 * ]);
 * ```
 *
 * **Advanced usage:**
 * ```javascript
 * // Use the constructor to get more control over the initialization.
 * const requestList = await RequestList.open(null, [
 *     // Separate requests
 *     { url: 'http://www.example.com/page-1', method: 'GET', headers: { ... } },
 *     { url: 'http://www.example.com/page-2', userData: { foo: 'bar' }},
 *
 *     // Bulk load of URLs from file `http://www.example.com/my-url-list.txt`
 *     // Note that all URLs must start with http:// or https://
 *     { requestsFromUrl: 'http://www.example.com/my-url-list.txt', userData: { isFromUrl: true } },
 * ], {
 *     // Persist the state to avoid re-crawling which can lead to data duplications.
 *     // Keep in mind that the sources have to be immutable or this will throw an error.
 *     persistStateKey: 'my-state',
 * });
 * ```
 * @category Sources
 */
export class RequestList {
    private log = log.child({ prefix: 'RequestList' });

    /**
     * Array of all requests from all sources, in the order as they appeared in sources.
     * All requests in the array have distinct uniqueKey!
     * @internal
     */
    requests: Request[] = [];

    /** Index to the next item in requests array to fetch. All previous requests are either handled or in progress. */
    private nextIndex = 0;

    /** Dictionary, key is Request.uniqueKey, value is corresponding index in the requests array. */
    private uniqueKeyToIndex: Record<string, number> = {};

    /**
     * Set of `uniqueKey`s of requests that were returned by fetchNextRequest().
     * @internal
     */
    inProgress = new Set<string>();

    /**
     * Set of `uniqueKey`s of requests for which reclaimRequest() was called.
     * @internal
     */
    reclaimed = new Set<string>();

    /**
     * Starts as true because until we handle the first request, the list is effectively persisted by doing nothing.
     * @internal
     */
    isStatePersisted = true;

    /**
     * Starts as false because we don't know yet and sources might change in the meantime (eg. download from live list).
     * @internal
     */
    areRequestsPersisted = false;

    private isLoading = false;
    private isInitialized = false;
    private persistStateKey?: string;
    private persistRequestsKey?: string;
    private initialState?: RequestListState;
    private store?: KeyValueStore;
    private keepDuplicateUrls: boolean;
    private sources: Source[];
    private sourcesFunction?: RequestListSourcesFunction;
    private proxyConfiguration?: ProxyConfiguration;
    private events: EventManager;

    /**
     * To create new instance of `RequestList` we need to use `RequestList.open()` factory method.
     * @param options All `RequestList` configuration options
     * @internal
     */
    private constructor(options: RequestListOptions = {}) {
        const {
            sources,
            sourcesFunction,
            persistStateKey,
            persistRequestsKey,
            state,
            proxyConfiguration,
            keepDuplicateUrls = false,
            config = Configuration.getGlobalConfig(),
        } = options;

        if (!(sources || sourcesFunction)) {
            throw new ArgumentError('At least one of "sources" or "sourcesFunction" must be provided.', this.constructor);
        }
        ow(options, ow.object.exactShape({
            sources: ow.optional.array, // check only for array and not subtypes to avoid iteration over the whole thing
            sourcesFunction: ow.optional.function,
            persistStateKey: ow.optional.string,
            persistRequestsKey: ow.optional.string,
            state: ow.optional.object.exactShape({
                nextIndex: ow.number,
                nextUniqueKey: ow.string,
                inProgress: ow.object,
            }),
            keepDuplicateUrls: ow.optional.boolean,
            proxyConfiguration: ow.optional.object,
        }));

        this.persistStateKey = persistStateKey ? `SDK_${persistStateKey}` : persistStateKey;
        this.persistRequestsKey = persistRequestsKey ? `SDK_${persistRequestsKey}` : persistRequestsKey;
        this.initialState = state;
        this.events = config.getEventManager();

        // If this option is set then all requests will get a pre-generated unique ID and duplicate URLs will be kept in the list.
        this.keepDuplicateUrls = keepDuplicateUrls;

        // Will be empty after initialization to save memory.
        this.sources = sources ? [...sources] : [];
        this.sourcesFunction = sourcesFunction;

        // The proxy configuration used for `requestsFromUrls` requests.
        this.proxyConfiguration = proxyConfiguration;
    }

    /**
     * Loads all remote sources of URLs and potentially starts periodic state persistence.
     * This function must be called before you can start using the instance in a meaningful way.
     */
    private async initialize(): Promise<this> {
        if (this.isLoading) {
            throw new Error('RequestList sources are already loading or were loaded.');
        }

        this.isLoading = true;
        await purgeDefaultStorages();

        const [state, persistedRequests] = await this._loadStateAndPersistedRequests();

        // Add persisted requests / new sources in a memory efficient way because with very
        // large lists, we were running out of memory.
        if (persistedRequests) {
            await this._addPersistedRequests(persistedRequests as Buffer);
        } else {
            await this._addRequestsFromSources();
        }

        this._restoreState(state as RequestListState);
        this.isInitialized = true;
        if (this.persistRequestsKey && !this.areRequestsPersisted) await this._persistRequests();
        if (this.persistStateKey) {
            this.events.on(EventType.PERSIST_STATE, this.persistState.bind(this));
        }

        return this;
    }

    /**
     * Adds previously persisted Requests, as retrieved from the key-value store.
     * This needs to be done in a memory efficient way. We should update the input
     * to a Stream once apify-client supports streams.
     */
    protected async _addPersistedRequests(persistedRequests: Buffer): Promise<void> {
        // We don't need the sources so we purge them to
        // prevent them from hanging in memory.
        for (let i = 0; i < this.sources.length; i++) {
            delete this.sources[i];
        }
        this.sources = [];

        this.areRequestsPersisted = true;
        const requestStream = createDeserialize(persistedRequests);
        for await (const request of requestStream) {
            this._addRequest(request);
        }
    }

    /**
     * Add Requests from both options.sources and options.sourcesFunction.
     * This function is called only when persisted sources were not loaded.
     * We need to avoid keeping both sources and requests in memory
     * to reduce memory footprint with very large sources.
     */
    protected async _addRequestsFromSources(): Promise<void> {
        // We'll load all sources in sequence to ensure that they get loaded in the right order.
        const sourcesCount = this.sources.length;
        for (let i = 0; i < sourcesCount; i++) {
            const source = this.sources[i];
            // Using delete here to drop the original object ASAP to free memory
            // .pop would reverse the array and .shift is SLOW.
            delete this.sources[i];

            if (typeof source === 'object' && (source as Dictionary).requestsFromUrl) {
                const fetchedRequests = await this._fetchRequestsFromUrl(source as InternalSource);
                await this._addFetchedRequests(source as InternalSource, fetchedRequests);
            } else {
                this._addRequest(source);
            }
        }

        // Drop the original array full of empty indexes.
        this.sources = [];

        if (this.sourcesFunction) {
            try {
                const sourcesFromFunction = await this.sourcesFunction();
                const sourcesFromFunctionCount = sourcesFromFunction.length;
                for (let i = 0; i < sourcesFromFunctionCount; i++) {
                    const source = sourcesFromFunction.shift();
                    this._addRequest(source!);
                }
            } catch (e) {
                const err = e as Error;
                throw new Error(`Loading requests with sourcesFunction failed.\nCause: ${err.message}`);
            }
        }
    }

    /**
     * Persists the current state of the `RequestList` into the default {@apilink KeyValueStore}.
     * The state is persisted automatically in regular intervals, but calling this method manually
     * is useful in cases where you want to have the most current state available after you pause
     * or stop fetching its requests. For example after you pause or abort a crawl. Or just before
     * a server migration.
     */
    async persistState(): Promise<void> {
        if (!this.persistStateKey) {
            throw new Error('Cannot persist state. options.persistStateKey is not set.');
        }
        if (this.isStatePersisted) return;
        try {
            this.store ??= await KeyValueStore.open();
            await this.store.setValue(this.persistStateKey, this.getState());
            this.isStatePersisted = true;
        } catch (e) {
            const err = e as Error;
            this.log.exception(err, 'Attempted to persist state, but failed.');
        }
    }

    /**
     * Unlike persistState(), this is used only internally, since the sources
     * are automatically persisted at RequestList initialization (if the persistRequestsKey is set),
     * but there's no reason to persist it again afterwards, because RequestList is immutable.
     */
    protected async _persistRequests(): Promise<void> {
        const serializedRequests = await serializeArray(this.requests);
        this.store ??= await KeyValueStore.open();
        await this.store.setValue(this.persistRequestsKey!, serializedRequests, { contentType: CONTENT_TYPE_BINARY });
        this.areRequestsPersisted = true;
    }

    /**
     * Restores RequestList state from a state object.
     */
    protected _restoreState(state?: RequestListState): void {
        // If there's no state it means we've not persisted any (yet).
        if (!state) return;
        // Restore previous state.
        if (typeof state.nextIndex !== 'number' || state.nextIndex < 0) {
            throw new Error('The state object is invalid: nextIndex must be a non-negative number.');
        }
        if (state.nextIndex > this.requests.length) {
            throw new Error('The state object is not consistent with RequestList, too few requests loaded.');
        }
        if (state.nextIndex < this.requests.length
            && this.requests[state.nextIndex].uniqueKey !== state.nextUniqueKey) {
            throw new Error('The state object is not consistent with RequestList the order of URLs seems to have changed.');
        }

        const deleteFromInProgress: string[] = [];
        state.inProgress.forEach((uniqueKey) => {
            const index = this.uniqueKeyToIndex[uniqueKey];
            if (typeof index !== 'number') {
                throw new Error('The state object is not consistent with RequestList. Unknown uniqueKey is present in the state.');
            }
            if (index >= state.nextIndex) {
                deleteFromInProgress.push(uniqueKey);
            }
        });

        this.nextIndex = state.nextIndex;
        this.inProgress = new Set(state.inProgress);

        // WORKAROUND:
        // It happened to some users that state object contained something like:
        // {
        //   "nextIndex": 11308,
        //   "nextUniqueKey": "https://www.anychart.com",
        //   "inProgress": {
        //      "https://www.ams360.com": true,
        //      ...
        //        "https://www.anychart.com": true,
        // }
        // Which then caused error "The request is not being processed (uniqueKey: https://www.anychart.com)"
        // As a workaround, we just remove all inProgress requests whose index >= nextIndex,
        // since they will be crawled again.
        if (deleteFromInProgress.length) {
            this.log.warning('RequestList\'s in-progress field is not consistent, skipping invalid in-progress entries', {
                deleteFromInProgress,
            });
            for (const uniqueKey of deleteFromInProgress) {
                this.inProgress.delete(uniqueKey);
            }
        }

        // All in-progress requests need to be re-crawled
        this.reclaimed = new Set(this.inProgress);
    }

    /**
     * Attempts to load state and requests using the `RequestList` configuration
     * and returns a tuple of [state, requests] where each may be null if not loaded.
     */
    protected async _loadStateAndPersistedRequests(): Promise<[RequestListState, Buffer]> {
        let state!: RequestListState;
        let persistedRequests!: Buffer;

        if (this.initialState) {
            state = await this.initialState;
            this.log.debug('Loaded state from options.state argument.');
        } else if (this.persistStateKey) {
            state = await this._getPersistedState(this.persistStateKey);
            if (state) this.log.debug('Loaded state from key value store using the persistStateKey.');
        }

        if (this.persistRequestsKey) {
            persistedRequests = await this._getPersistedState(this.persistRequestsKey);
            if (persistedRequests) this.log.debug('Loaded requests from key value store using the persistRequestsKey.');
        }

        return [state, persistedRequests];
    }

    /**
     * Returns an object representing the internal state of the `RequestList` instance.
     * Note that the object's fields can change in future releases.
     */
    getState(): RequestListState {
        this._ensureIsInitialized();

        return {
            nextIndex: this.nextIndex,
            nextUniqueKey: this.nextIndex < this.requests.length
                ? this.requests[this.nextIndex].uniqueKey
                : null,
            inProgress: [...this.inProgress],
        };
    }

    /**
     * Resolves to `true` if the next call to {@apilink RequestList.fetchNextRequest} function
     * would return `null`, otherwise it resolves to `false`.
     * Note that even if the list is empty, there might be some pending requests currently being processed.
     */
    async isEmpty(): Promise<boolean> {
        this._ensureIsInitialized();

        return this.reclaimed.size === 0 && this.nextIndex >= this.requests.length;
    }

    /**
     * Returns `true` if all requests were already handled and there are no more left.
     */
    async isFinished(): Promise<boolean> {
        this._ensureIsInitialized();

        return this.inProgress.size === 0 && this.nextIndex >= this.requests.length;
    }

    /**
     * Gets the next {@apilink Request} to process. First, the function gets a request previously reclaimed
     * using the {@apilink RequestList.reclaimRequest} function, if there is any.
     * Otherwise it gets the next request from sources.
     *
     * The function's `Promise` resolves to `null` if there are no more
     * requests to process.
     */
    async fetchNextRequest(): Promise<Request | null> {
        this._ensureIsInitialized();

        // First return reclaimed requests if any.
        const uniqueKey = this.reclaimed.values().next().value;
        if (uniqueKey) {
            this.reclaimed.delete(uniqueKey);
            const index = this.uniqueKeyToIndex[uniqueKey];
            return this.requests[index];
        }

        // Otherwise return next request.
        if (this.nextIndex < this.requests.length) {
            const request = this.requests[this.nextIndex];
            this.inProgress.add(request.uniqueKey);
            this.nextIndex++;
            this.isStatePersisted = false;
            return request;
        }

        return null;
    }

    /**
     * Marks request as handled after successful processing.
     */
    async markRequestHandled(request: Request): Promise<void> {
        const { uniqueKey } = request;

        this._ensureUniqueKeyValid(uniqueKey);
        this._ensureInProgressAndNotReclaimed(uniqueKey);
        this._ensureIsInitialized();

        this.inProgress.delete(uniqueKey);
        this.isStatePersisted = false;
    }

    /**
     * Reclaims request to the list if its processing failed.
     * The request will become available in the next `this.fetchNextRequest()`.
     */
    async reclaimRequest(request: Request): Promise<void> {
        const { uniqueKey } = request;

        this._ensureUniqueKeyValid(uniqueKey);
        this._ensureInProgressAndNotReclaimed(uniqueKey);
        this._ensureIsInitialized();

        this.reclaimed.add(uniqueKey);
    }

    /**
     * Adds all fetched requests from a URL from a remote resource.
     */
    protected async _addFetchedRequests(source: InternalSource, fetchedRequests: RequestOptions[]) {
        const { requestsFromUrl, regex } = source;
        const originalLength = this.requests.length;

        fetchedRequests.forEach((request) => this._addRequest(request));

        const fetchedCount = fetchedRequests.length;
        const importedCount = this.requests.length - originalLength;

        this.log.info('Fetched and loaded Requests from a remote resource.', {
            requestsFromUrl,
            regex,
            fetchedCount,
            importedCount,
            duplicateCount: fetchedCount - importedCount,
            sample: JSON.stringify(fetchedRequests.slice(0, 5)),
        });
    }

    protected async _getPersistedState<T>(key: string): Promise<T> {
        this.store ??= await KeyValueStore.open();
        const state = await this.store.getValue<T>(key);

        return state!;
    }

    /**
     * Fetches URLs from requestsFromUrl and returns them in format of list of requests
     */
    protected async _fetchRequestsFromUrl(source: InternalSource): Promise<RequestOptions[]> {
        const { requestsFromUrl, regex, ...sharedOpts } = source;

        // Download remote resource and parse URLs.
        let urlsArr;
        try {
            urlsArr = await this._downloadListOfUrls({ url: requestsFromUrl, urlRegExp: regex, proxyUrl: await this.proxyConfiguration?.newUrl() });
        } catch (err) {
            throw new Error(`Cannot fetch a request list from ${requestsFromUrl}: ${err}`);
        }

        // Skip if resource contained no URLs.
        if (!urlsArr.length) {
            this.log.warning('list fetched, but it is empty.', { requestsFromUrl, regex });
            return [];
        }

        return urlsArr.map((url) => ({ url, ...sharedOpts }));
    }

    /**
     * Adds given request.
     * If the `source` parameter is a string or plain object and not an instance
     * of a `Request`, then the function creates a `Request` instance.
     */
    protected _addRequest(source: Source) {
        let request;
        const type = typeof source;
        if (type === 'string') {
            request = new Request({ url: source as string });
        } else if (source instanceof Request) {
            request = source;
        } else if (source && type === 'object') {
            request = new Request(source as RequestOptions);
        } else {
            throw new Error(`Cannot create Request from type: ${type}`);
        }

        const hasUniqueKey = Reflect.has(Object(source), 'uniqueKey');

        // Add index to uniqueKey if duplicates are to be kept
        if (this.keepDuplicateUrls && !hasUniqueKey) {
            request.uniqueKey += `-${this.requests.length}`;
        }

        const { uniqueKey } = request;
        this._ensureUniqueKeyValid(uniqueKey);

        // Skip requests with duplicate uniqueKey
        if (!this.uniqueKeyToIndex.hasOwnProperty(uniqueKey)) {
            this.uniqueKeyToIndex[uniqueKey] = this.requests.length;
            this.requests.push(request);
        } else if (this.keepDuplicateUrls) {
            this.log.warning(`Duplicate uniqueKey: ${uniqueKey} found while the keepDuplicateUrls option was set. Check your sources' unique keys.`);
        }
    }

    /**
     * Helper function that validates unique key.
     * Throws an error if uniqueKey is not a non-empty string.
     */
    protected _ensureUniqueKeyValid(uniqueKey: string): void {
        if (typeof uniqueKey !== 'string' || !uniqueKey) {
            throw new Error('Request object\'s uniqueKey must be a non-empty string');
        }
    }

    /**
     * Checks that request is not reclaimed and throws an error if so.
     */
    protected _ensureInProgressAndNotReclaimed(uniqueKey: string): void {
        if (!this.inProgress.has(uniqueKey)) {
            throw new Error(`The request is not being processed (uniqueKey: ${uniqueKey})`);
        }
        if (this.reclaimed.has(uniqueKey)) {
            throw new Error(`The request was already reclaimed (uniqueKey: ${uniqueKey})`);
        }
    }

    /**
     * Throws an error if request list wasn't initialized.
     */
    protected _ensureIsInitialized(): void {
        if (!this.isInitialized) {
            throw new Error('RequestList is not initialized; you must call "await requestList.initialize()" before using it!');
        }
    }

    /**
     * Returns the total number of unique requests present in the `RequestList`.
     */
    length(): number {
        this._ensureIsInitialized();

        return this.requests.length;
    }

    /**
     * Returns number of handled requests.
     */
    handledCount(): number {
        this._ensureIsInitialized();

        return this.nextIndex - this.inProgress.size;
    }

    /**
     * Opens a request list and returns a promise resolving to an instance
     * of the {@apilink RequestList} class that is already initialized.
     *
     * {@apilink RequestList} represents a list of URLs to crawl, which is always stored in memory.
     * To enable picking up where left off after a process restart, the request list sources
     * are persisted to the key-value store at initialization of the list. Then, while crawling,
     * a small state object is regularly persisted to keep track of the crawling status.
     *
     * For more details and code examples, see the {@apilink RequestList} class.
     *
     * **Example usage:**
     *
     * ```javascript
     * const sources = [
     *     'https://www.example.com',
     *     'https://www.google.com',
     *     'https://www.bing.com'
     * ];
     *
     * const requestList = await RequestList.open('my-name', sources);
     * ```
     *
     * @param listNameOrOptions
     *   Name of the request list to be opened, or the options object. Setting a name enables the `RequestList`'s
     *   state to be persisted in the key-value store. This is useful in case of a restart or migration. Since `RequestList`
     *   is only stored in memory, a restart or migration wipes it clean. Setting a name will enable the `RequestList`'s
     *   state to survive those situations and continue where it left off.
     *
     *   The name will be used as a prefix in key-value store, producing keys such as `NAME-REQUEST_LIST_STATE`
     *   and `NAME-REQUEST_LIST_SOURCES`.
     *
     *   If `null`, the list will not be persisted and will only be stored in memory. Process restart
     *   will then cause the list to be crawled again from the beginning. We suggest always using a name.
     * @param [sources]
     *  An array of sources of URLs for the {@apilink RequestList}. It can be either an array of strings,
     *  plain objects that define at least the `url` property, or an array of {@apilink Request} instances.
     *
     *  **IMPORTANT:** The `sources` array will be consumed (left empty) after {@apilink RequestList} initializes.
     *  This is a measure to prevent memory leaks in situations when millions of sources are
     *  added.
     *
     *  Additionally, the `requestsFromUrl` property may be used instead of `url`,
     *  which will instruct {@apilink RequestList} to download the source URLs from a given remote location.
     *  The URLs will be parsed from the received response. In this case you can limit the URLs
     *  using `regex` parameter containing regular expression pattern for URLs to be included.
     *
     *  For details, see the {@apilink RequestListOptions.sources}
     * @param [options]
     *   The {@apilink RequestList} options. Note that the `listName` parameter supersedes
     *   the {@apilink RequestListOptions.persistStateKey} and {@apilink RequestListOptions.persistRequestsKey}
     *   options and the `sources` parameter supersedes the {@apilink RequestListOptions.sources} option.
     */
    static async open(listNameOrOptions: string | null | RequestListOptions, sources?: Source[], options: RequestListOptions = {}): Promise<RequestList> {
        if (listNameOrOptions != null && typeof listNameOrOptions === 'object') {
            options = { ...listNameOrOptions, ...options };
            const rl = new RequestList(options);
            await rl.initialize();

            return rl;
        }

        const listName = listNameOrOptions;

        ow(listName, ow.optional.any(ow.string, ow.null));
        ow(sources, ow.array);
        ow(options, ow.object.is((v) => !Array.isArray(v)));

        const rl = new RequestList({
            ...options,
            persistStateKey: listName ? `${listName}-${STATE_PERSISTENCE_KEY}` : undefined,
            persistRequestsKey: listName ? `${listName}-${REQUESTS_PERSISTENCE_KEY}` : undefined,
            sources,
        });
        await rl.initialize();

        return rl;
    }

    /**
     * @internal wraps public utility for mocking purposes
     */
    private async _downloadListOfUrls(options: { url: string; urlRegExp?: RegExp; proxyUrl?: string }): Promise<string[]> {
        return downloadListOfUrls(options);
    }
}

/**
 * Represents state of a {@apilink RequestList}. It can be used to resume a {@apilink RequestList} which has been previously processed.
 * You can obtain the state by calling {@apilink RequestList.getState} and receive an object with
 * the following structure:
 *
 * ```
 * {
 *     nextIndex: 5,
 *     nextUniqueKey: 'unique-key-5'
 *     inProgress: {
 *         'unique-key-1': true,
 *         'unique-key-4': true
 *     },
 * }
 * ```
 */
export interface RequestListState {

    /** Position of the next request to be processed. */
    nextIndex: number;

    /** Key of the next request to be processed. */
    nextUniqueKey: string | null;

    /** Array of request keys representing those that being processed at the moment. */
    inProgress: string[];

}

export type Source = string | (Partial<RequestOptions> & { requestsFromUrl?: string; regex?: RegExp }) | Request;
interface InternalSource { requestsFromUrl: string; regex?: RegExp }
export type RequestListSourcesFunction = () => Promise<Source[]>;
