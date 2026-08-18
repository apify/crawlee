import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { applyRequestTransform, AutoscaledPool, bindMethodsToServiceLocator, BLOCKED_STATUS_CODES, buildEnqueueStrategyPatterns, ConcurrencySystem, Configuration, constructUrlPatternObjects, ContextPipeline, ContextPipelineCleanupError, ContextPipelineInitializationError, ContextPipelineInterruptedError, createRequestOptions, createStorageTransaction, Request, CriticalError, currentStorageTransaction, Dataset, EnqueueStrategy, EventManager, EventType, filterRequestOptionsByPatterns, getObjectType, KeyValueStore, log, LogLevel, mergeCookies, MissingSessionError, NavigationSkippedError, NonRetryableError, OwnedOrInjected, purgeDefaultStorages, RequestHandlerError, parseRetryAfterHeader, RequestThrottledError, RequestManagerTandem, RequestQueue, RequestState, RetryRequestError, supportsDomainThrottling, Router, ServiceLocator, serviceLocator, Session, SessionError, SessionPool, Statistics, ThrottlingRequestManager, validateUserData, validators, withDirectStorageAccess, } from '@crawlee/core';
import { BaseHttpClient, FetchHttpClient } from '@crawlee/http-client';
import { isAsyncIterable, isIterable, parseArgument, ROTATE_PROXY_ERRORS, schemas } from '@crawlee/utils/internal';
import { RobotsTxtFile } from '@crawlee/utils';
import { getDomain } from 'tldts';
import { z } from 'zod';
import { LruCache } from '@apify/datastructures';
import { addTimeoutToPromise, extendTimeout, TimeoutError } from '@apify/timeout';
import { cryptoRandomObjectId } from '@apify/utilities';
import { extendTimeoutKey, navigationDeadlineKey, raceWithTimeout, timeoutExpiredKey, } from './request-timeout.js';
import { createSendRequest } from './send-request.js';
class LazyDefaultHttpClient extends BaseHttpClient {
    #delegatePromise;
    constructor(options) {
        super(options);
        this.#delegatePromise = import('@crawlee/impit-client')
            .then(({ ImpitHttpClient }) => new ImpitHttpClient(options))
            .catch(() => {
            (options?.logger ?? log).warning('Optional dependency @crawlee/impit-client is not installed. ' +
                'Falling back to native fetch — proxy support and browser fingerprinting are unavailable.');
            return new FetchHttpClient(options);
        });
    }
    fetch() {
        throw new Error('LazyDefaultHttpClient delegates `sendRequest` entirely; `fetch` is never called.');
    }
    async sendRequest(...args) {
        return (await this.#delegatePromise).sendRequest(...args);
    }
}
/**
 * Since there's no set number of seconds before the container is terminated after
 * a migration event, we need some reasonable number to use for RequestList persistence.
 * Once a migration event is received, the crawler will be paused, and it will wait for
 * this long before persisting the RequestList state. This should allow most healthy
 * requests to finish and be marked as handled, thus lowering the amount of duplicate
 * results after migration.
 * @ignore
 */
const SAFE_MIGRATION_WAIT_MILLIS = 20000;
const deferredCleanupKey = Symbol('deferredCleanup');
// The request timeout plumbing (the window helper, the context symbols, and the race) lives in its own module.
export { navigationDeadlineKey, remainingNavigationWindowMillis } from './request-timeout.js';
const urlPatternSchema = z.union([
    z.string(),
    z.instanceof(RegExp),
    schemas.objectWithKeys(['glob']),
    schemas.objectWithKeys(['regexp']),
]);
// `looseObject` (rather than `strictObject`) lets subclasses forward their own extraction-only options
// (e.g. `selector`) straight through without having to strip them out first.
const addRequestsOptionsSchema = z.looseObject({
    forefront: z.boolean().optional(),
    cache: z.boolean().optional(),
    waitForAllRequestsToBeAdded: z.boolean().optional(),
    batchSize: schemas.anyNumber.optional(),
    waitBetweenBatchesMillis: schemas.anyNumber.optional(),
    maxNewRequests: schemas.anyNumber.optional(),
    limit: schemas.anyNumber.optional(),
    baseUrl: z.string().optional(),
    userData: schemas.anyObject.optional(),
    label: z.string().optional(),
    sessionId: z.string().optional(),
    skipNavigation: z.boolean().optional(),
    include: schemas.arrayOf(urlPatternSchema, 'URL patterns').min(1).optional(),
    exclude: schemas.arrayOf(urlPatternSchema, 'URL patterns').optional(),
    transformRequestFunction: schemas.anyFunction.optional(),
    strategy: z.enum(EnqueueStrategy).optional(),
    onSkippedRequest: schemas.anyFunction.optional(),
});
export class BasicCrawler {
    static #CRAWLEE_STATE_KEY = 'CRAWLEE_STATE';
    /**
     * Tracks the number of crawler instances created. The first crawler uses the default
     * request queue; subsequent ones get their own queue via a unique alias so they don't
     * collide.
     */
    static #instanceCount = 0;
    /** @internal Reset static instance counter for test isolation. */
    static resetInstanceCount() {
        BasicCrawler.#instanceCount = 0;
    }
    /**
     * Tracks crawler instances that accessed shared state without having an explicit id.
     * Used to detect and warn about multiple crawlers sharing the same state.
     */
    static #useStateAnonymousIndices = new Set();
    /** Backs the {@apilink BasicCrawler.statistics|`statistics`} getter. */
    #statisticsDep;
    /**
     * The statistics instance collecting the crawler's run statistics - either the injected `statistics` option or a
     * crawler-built default. Typed as {@apilink IStatistics} so custom implementations can be plugged in.
     */
    get statistics() {
        return this.#statisticsDep.value;
    }
    /**
     * The main request-handling component of the crawler. It manages the requests that the crawler processes,
     * combining any provided request loader and/or queue. It's initialized during the crawler startup or lazily
     * via {@apilink BasicCrawler.getRequestManager|`getRequestManager()`}.
     */
    requestManager;
    /** Backs the {@apilink BasicCrawler.sessionPool|`sessionPool`} getter. */
    #sessionPoolDep;
    /**
     * A reference to the underlying session pool that manages the crawler's {@apilink Session|sessions}. Typed as
     * {@apilink ISessionPool} so custom implementations can be plugged in via the `sessionPool` constructor option.
     */
    get sessionPool() {
        return this.#sessionPoolDep.value;
    }
    /**
     * Tracks **only** the queue the crawler opens for itself — not the {@apilink RequestManagerTandem} that may wrap it
     * around a user-supplied `requestList` — so the owned-only purge between repeated `run()` calls never reaches
     * through to a borrowed loader. Filled lazily in {@apilink BasicCrawler.openOwnedRequestQueue|`openOwnedRequestQueue()`}.
     */
    #ownedRequestQueue = OwnedOrInjected.resolve();
    /**
     * Whether the request-processing-time hint has already been forwarded to the request manager. The hint
     * derives only from `requestHandlerTimeoutMillis` (constant for the crawler's lifetime) and is raise-only,
     * so it only needs to be applied once, at the first async access of the manager.
     */
    #requestManagerTimeoutsApplied = false;
    /**
     * Resolves the governor for one run: either the injected
     * {@apilink BasicCrawlerOptions.concurrencySystem|`concurrencySystem`} (borrowed) or a freshly built default with
     * the concurrency shortcuts folded in (owned, so the crawler starts and stops it).
     */
    #resolveConcurrencySystem;
    /** As resolved by `init()`. Absent until the first run, so a `teardown()` before it is a no-op. */
    #concurrencySystemDep;
    /**
     * The concurrency governor this run is booking its requests against — either the
     * {@apilink BasicCrawlerOptions.concurrencySystem|`concurrencySystem`} that was injected, or the default the
     * crawler built for itself. Read it for telemetry: `desiredConcurrency`, `currentConcurrency`, `isRunning`.
     *
     * > *NOTE:* `undefined` until {@apilink BasicCrawler.run|`crawler.run()`} has resolved it. A crawler-owned default
     * is also rebuilt for every run, so the instance is not stable across runs.
     *
     * {@apilink IConcurrencySystem} is deliberately read-only. Tuning concurrency *while a crawl is running* means
     * owning the instance: build a {@apilink ConcurrencySystem} yourself and inject it, then set
     * `minConcurrency`/`maxConcurrency`/`desiredConcurrency` on your own reference.
     */
    get concurrencySystem() {
        return this.#concurrencySystemDep?.maybeValue;
    }
    /**
     * The task loop that dispatches this run's requests. Private on purpose — it is a bare parallel task runner with
     * no configuration left of its own (see {@apilink ConcurrencySystem}), and everything a caller legitimately did
     * with it now has a crawler-level counterpart: {@apilink BasicCrawler.pause|`pause()`},
     * {@apilink BasicCrawler.resume|`resume()`}, {@apilink BasicCrawler.teardown|`teardown()`} and
     * {@apilink BasicCrawler.concurrencySystem|`concurrencySystem`}.
     */
    #autoscaledPool;
    /**
     * A reference to the underlying {@apilink IProxyConfiguration} instance that manages the crawler's proxies.
     * Only available if used by the crawler.
     */
    proxyConfiguration;
    /**
     * Default {@apilink Router} instance that will be used if we don't specify any {@apilink BasicCrawlerOptions.requestHandler|`requestHandler`}.
     * See {@apilink Router.addHandler|`router.addHandler()`} and {@apilink Router.addDefaultHandler|`router.addDefaultHandler()`}.
     */
    router = Router.create();
    #basicContextPipeline;
    /**
     * The basic part of the context pipeline. Unlike the subclass pipeline, this
     * part has no major side effects (e.g. launching a browser). It also makes typing more explicit, as subclass
     * pipelines expect the basic crawler fields to already be present in the context at runtime.
     *
     * Context built with this pipeline can be passed into multiple crawler pipelines at once.
     * This is used e.g. in the {@apilink AdaptivePlaywrightCrawler|`AdaptivePlaywrightCrawler`}.
     */
    get basicContextPipeline() {
        if (this.#basicContextPipeline === undefined) {
            this.#basicContextPipeline = this.buildBasicContextPipeline();
        }
        return this.#basicContextPipeline;
    }
    #contextPipeline;
    get contextPipeline() {
        if (this.#contextPipeline === undefined) {
            this.#contextPipeline = this.buildFinalContextPipeline();
        }
        return this.#contextPipeline;
    }
    running = false;
    hasFinishedBefore = false;
    #unexpectedStop = false;
    #log;
    get log() {
        return this.#log;
    }
    requestHandler;
    errorHandler;
    failedRequestHandler;
    requestHandlerTimeoutMillis;
    internalTimeoutMillis;
    #maxRequestRetries;
    #maxCrawlDepth;
    #sameDomainDelaySecs;
    #maxRequestsPerCrawl;
    get handledRequestsCount() {
        return this.statistics.state.requestsFinished + this.statistics.state.requestsFailed;
    }
    #statusMessageLoggingInterval;
    #statusMessageCallback;
    blockedStatusCodes = new Set();
    additionalHttpErrorStatusCodes;
    #ignoreHttpErrorStatusCodes;
    /**
     * The resolved options for the crawler's own task loop — the crawler-owned `runTaskFunction`, the (possibly
     * user-overridden) ready/finished predicates and cadence/logging. Concurrency configuration lives on the
     * {@apilink ConcurrencySystem} instead, and the loop's `consumer` identity is the crawler's own, so neither is
     * settable here.
     */
    #taskLoopOptions;
    httpClient;
    retryOnBlocked;
    #respectRobotsTxtFile;
    /** Whether `runInStorageTransaction()` opens a transaction at all. */
    #transactionalStorageEnabled;
    /** The resolved per-storage-type write policy overrides forwarded to each request's transaction. */
    #storageWritePolicy;
    #onSkippedRequest;
    #closeEvents;
    #loggedPerRun = new Set();
    #robotsTxtFileCache;
    #identity;
    #contextPipelineOptions;
    /**
     * @internal
     */
    static optionsShape = {
        contextPipelineBuilder: schemas.anyObject.optional(),
        extendContext: schemas.anyFunction.optional(),
        requestList: validators.requestList.optional(),
        requestQueue: validators.requestQueue.optional(),
        requestManager: validators.requestManager.optional(),
        // Subclasses override this function instead of passing it
        // in constructor, so this validation needs to apply only
        // if the user creates an instance of BasicCrawler directly.
        requestHandler: schemas.anyFunction.optional(),
        requestHandlerTimeoutSecs: schemas.anyNumber.optional(),
        errorHandler: schemas.anyFunction.optional(),
        failedRequestHandler: schemas.anyFunction.optional(),
        maxRequestRetries: schemas.anyNumber.default(3),
        sameDomainDelaySecs: schemas.anyNumber.default(0),
        maxRequestsPerCrawl: schemas.anyNumber.optional(),
        maxCrawlDepth: schemas.anyNumber.optional(),
        // No zod default — subclasses provide their own fallback (e.g. HTTP-optimized pool options).
        taskLoopOptions: schemas.anyObject.optional(),
        concurrencySystem: schemas.anyObject.optional(),
        sessionPool: validators.sessionPool.optional(),
        proxyConfiguration: validators.proxyConfiguration.optional(),
        statusMessageLoggingInterval: schemas.anyNumber.default(10),
        statusMessageCallback: schemas.anyFunction.optional(),
        additionalHttpErrorStatusCodes: schemas.arrayOf(schemas.anyNumber, 'numbers').default(() => []),
        ignoreHttpErrorStatusCodes: schemas.arrayOf(schemas.anyNumber, 'numbers').default(() => []),
        blockedStatusCodes: schemas.arrayOf(schemas.anyNumber, 'numbers').optional(),
        retryOnBlocked: z.boolean().default(false),
        respectRobotsTxtFile: z.union([z.boolean(), schemas.anyObject]).default(false),
        transactionalStorage: z
            .union([z.boolean(), z.strictObject({ requestQueue: z.enum(['deferred', 'writeThrough']).optional() })])
            .optional(),
        onSkippedRequest: schemas.anyFunction.optional(),
        httpClient: schemas.httpClient.optional(),
        configuration: z.instanceof(Configuration).optional(),
        storageBackend: validators.storageBackend.optional(),
        eventManager: z.instanceof(EventManager).optional(),
        logger: validators.logger.optional(),
        // AutoscaledPool shorthands
        minConcurrency: schemas.anyNumber.optional(),
        maxConcurrency: schemas.anyNumber.optional(),
        maxRequestsPerMinute: schemas.anyNumber
            .refine((value) => Number.isInteger(value) || value === Infinity, 'Expected an integer or infinite number')
            .refine((value) => value >= 1, 'Expected a number greater than or equal to 1')
            .optional(),
        keepAlive: z.boolean().optional(),
        statistics: schemas.anyObject.optional(),
        id: z.string().optional(),
    };
    static #optionsSchema = z.strictObject(BasicCrawler.optionsShape);
    /**
     * All `BasicCrawler` parameters are passed via an options object.
     */
    constructor(options = {}) {
        const parsedOptions = parseArgument(options, BasicCrawler.#optionsSchema, 'BasicCrawlerOptions');
        const { 
        // oxlint-disable-next-line typescript/no-deprecated -- still accepted and folded into `requestManager` for back-compat
        requestList, 
        // oxlint-disable-next-line typescript/no-deprecated -- still accepted and folded into `requestManager` for back-compat
        requestQueue, requestManager, maxRequestRetries, sameDomainDelaySecs, maxRequestsPerCrawl, maxCrawlDepth, taskLoopOptions = {}, concurrencySystem, keepAlive, sessionPool, proxyConfiguration, additionalHttpErrorStatusCodes, ignoreHttpErrorStatusCodes, 
        // Service locator options
        configuration, storageBackend, eventManager, logger, 
        // AutoscaledPool shorthands
        minConcurrency, maxConcurrency, maxRequestsPerMinute, blockedStatusCodes: blockedStatusCodesInput, retryOnBlocked, respectRobotsTxtFile, transactionalStorage, onSkippedRequest, requestHandler, requestHandlerTimeoutSecs, errorHandler, failedRequestHandler, statusMessageLoggingInterval, statusMessageCallback, statistics, httpClient, id, } = parsedOptions;
        // All concurrency configuration lives on the `ConcurrencySystem`, so the shortcuts have nowhere to go once
        // one is supplied - and silently dropping a `maxConcurrency` the user asked for is how crawls end up
        // hammering a site.
        if (concurrencySystem !== undefined &&
            (minConcurrency !== undefined || maxConcurrency !== undefined || maxRequestsPerMinute !== undefined)) {
            throw new Error('The `minConcurrency`/`maxConcurrency`/`maxRequestsPerMinute` shortcuts cannot be combined with ' +
                '`concurrencySystem` - they configure the default `ConcurrencySystem` that a supplied one ' +
                'replaces. Pass them to the `ConcurrencySystem` constructor instead.');
        }
        // Create per-crawler service locator if custom services were provided.
        // This wraps every method on the crawler instance so that calls to the global `serviceLocator`
        // (via AsyncLocalStorage) resolve to this scoped instance instead.
        // We also enter the scope for the rest of the constructor body, so that any code below
        // that accesses `serviceLocator` will see the correct (scoped) instance.
        let serviceLocatorScope = { enterScope: () => { }, exitScope: () => { } };
        if (storageBackend ||
            eventManager ||
            logger ||
            (configuration !== undefined && configuration !== serviceLocator.getConfiguration())) {
            // Inherit the ambient locator's already-set services for anything not explicitly
            // provided - e.g. only passing a `logger` must not detach the crawler from a globally
            // configured storage backend.
            const ambientServices = serviceLocator.getServicesIfSet();
            const scopedServiceLocator = new ServiceLocator(configuration ?? ambientServices.configuration, eventManager ?? ambientServices.eventManager, storageBackend ?? ambientServices.storageBackend, logger ?? ambientServices.logger);
            serviceLocatorScope = bindMethodsToServiceLocator(scopedServiceLocator, this);
        }
        try {
            serviceLocatorScope.enterScope();
            this.#contextPipelineOptions = {
                contextPipelineBuilder: parsedOptions.contextPipelineBuilder,
                extendContext: parsedOptions.extendContext,
            };
            this.#log = serviceLocator.getLogger().child({ prefix: this.constructor.name });
            // Initialize the Configuration instance to avoid lazy loading in the components
            serviceLocator.getConfiguration();
            const instanceIndex = BasicCrawler.#instanceCount++;
            this.#identity = { instanceIndex, hasExplicitId: id !== undefined, id: id ?? String(instanceIndex) };
            if (requestManager !== undefined) {
                if (requestList !== undefined || requestQueue !== undefined) {
                    throw new Error('The `requestManager` option cannot be used in conjunction with `requestList` and/or `requestQueue`');
                }
                // Both would pace the same domains, from different keys and with no idea of one another.
                if (sameDomainDelaySecs > 0 && supportsDomainThrottling(requestManager)) {
                    throw new Error('The `sameDomainDelaySecs` option cannot be combined with a `requestManager` that throttles ' +
                        'per domain on its own. Configure the delay on the manager instead, via the ' +
                        '`minCrawlDelaySecs` option of `ThrottlingRequestManager`.');
                }
                this.requestManager = requestManager;
            }
            else if (requestList !== undefined && requestQueue !== undefined) {
                // Combine the read-only list with the writable queue into a tandem.
                this.requestManager = new RequestManagerTandem(requestList, requestQueue);
            }
            else if (requestQueue !== undefined) {
                // A RequestQueue is itself a request manager.
                this.requestManager = requestQueue;
            }
            else if (requestList !== undefined) {
                // A lone read-only `requestList` (deprecated option) is combined with a lazily-opened default queue
                // into a tandem, so that its requests are read first and new ones can still be enqueued during the
                // crawl. The queue is opened on first use; the tandem also forwards `persistState()` to the loader.
                this.requestManager = new RequestManagerTandem(requestList, () => this.openOwnedRequestQueue());
            }
            this.httpClient = httpClient ?? new LazyDefaultHttpClient({ logger: this.log });
            this.proxyConfiguration = proxyConfiguration;
            this.#statusMessageLoggingInterval = statusMessageLoggingInterval;
            this.#statusMessageCallback = statusMessageCallback;
            this.#robotsTxtFileCache = new LruCache({ maxLength: 1000 });
            this.additionalHttpErrorStatusCodes = new Set([...additionalHttpErrorStatusCodes]);
            this.#ignoreHttpErrorStatusCodes = new Set([...ignoreHttpErrorStatusCodes]);
            this.requestHandler = requestHandler ?? this.router;
            this.failedRequestHandler = failedRequestHandler;
            this.errorHandler = errorHandler;
            if (requestHandlerTimeoutSecs) {
                this.requestHandlerTimeoutMillis = requestHandlerTimeoutSecs * 1000;
            }
            else {
                this.requestHandlerTimeoutMillis = 60_000;
            }
            this.retryOnBlocked = retryOnBlocked;
            this.#respectRobotsTxtFile = respectRobotsTxtFile;
            // The cast undoes ow's assertion signature, which mangles `boolean | object` unions.
            const transactionalStorageOption = transactionalStorage;
            this.#transactionalStorageEnabled = transactionalStorageOption !== false;
            this.#storageWritePolicy = typeof transactionalStorageOption === 'object' ? transactionalStorageOption : {};
            this.#onSkippedRequest = onSkippedRequest;
            // allow at least 5min for internal timeouts
            this.internalTimeoutMillis =
                serviceLocator.getConfiguration().internalTimeoutMillis ??
                    Math.max(this.requestHandlerTimeoutMillis * 2, 300e3);
            this.#maxRequestRetries = maxRequestRetries;
            this.#maxCrawlDepth = maxCrawlDepth;
            this.#sameDomainDelaySecs = sameDomainDelaySecs;
            this.#statisticsDep = OwnedOrInjected.resolve(statistics, 
            // A crawler-built default tracks the built-in fields only. A non-empty `StatisticStateExtension` can
            // only be satisfied by an injected instance carrying the matching `state`, so this branch does
            // not run in that case - hence the cast.
            () => new Statistics({
                logMessage: `${this.constructor.name} request statistics:`,
                log: this.log,
                id: this.#identity.id,
            }));
            if (sessionPool && proxyConfiguration) {
                this.log.warning('Both `sessionPool` and `proxyConfiguration` were provided to the crawler. ' +
                    'The `proxyConfiguration` is ignored - sessions from the supplied pool keep whatever ' +
                    '`proxyInfo` they were created with. Configure proxies on the pool instead, ' +
                    'e.g. via `addSession({ proxyInfo })` or a custom `createSessionFunction`.');
            }
            this.#sessionPoolDep = OwnedOrInjected.resolve(sessionPool, () => new SessionPool({
                createSessionFunction: async (opts) => new Session({
                    ...opts?.sessionOptions,
                    proxyInfo: opts?.sessionOptions?.proxyInfo ?? (await this.proxyConfiguration?.newProxyInfo()),
                }),
            }));
            this.blockedStatusCodes = new Set(blockedStatusCodesInput ?? BLOCKED_STATUS_CODES);
            const maxSignedInteger = 2 ** 31 - 1;
            if (this.requestHandlerTimeoutMillis > maxSignedInteger) {
                this.log.warning(`requestHandlerTimeoutMillis ${this.requestHandlerTimeoutMillis}` +
                    ` does not fit a signed 32-bit integer. Limiting the value to ${maxSignedInteger}`);
                this.requestHandlerTimeoutMillis = maxSignedInteger;
            }
            this.internalTimeoutMillis = Math.min(this.internalTimeoutMillis, maxSignedInteger);
            this.#maxRequestsPerCrawl = maxRequestsPerCrawl;
            const isMaxPagesExceeded = () => this.#maxRequestsPerCrawl && this.#maxRequestsPerCrawl <= this.handledRequestsCount;
            // eslint-disable-next-line prefer-const
            let { isFinishedFunction, isTaskReadyFunction } = taskLoopOptions;
            // override even if `isFinishedFunction` provided by user - `keepAlive` has higher priority
            if (keepAlive) {
                isFinishedFunction = async () => false;
            }
            const crawlerOwnedTaskLoopConfiguration = {
                runTaskFunction: async () => {
                    const source = this.requestManager;
                    if (!source)
                        throw new Error('Request provider is not initialized!');
                    const request = await this.resolveRequest();
                    if (!request) {
                        return;
                    }
                    // Started here, rather than in `handleRequest`, so that a failure during context pipeline
                    // initialization (e.g. a browser page timing out before the request handler ever runs) is
                    // still accounted for by `failJob` below - which is a no-op without a matching `startJob`.
                    this.statistics.startJob(request.id || request.uniqueKey);
                    const crawlingContext = { request };
                    try {
                        // The transaction spans the whole pipeline call, covering the navigation hooks
                        // and `extendContext` too; `handleRequest` drives its outcome explicitly.
                        await this.runInStorageTransaction(async () => 
                        // Navigation, the navigation hooks and the request handler are timed individually, but the
                        // phases between them are not, so a request could still get stuck indefinitely. This is the
                        // catch-all for that - see `raceWithTimeout` for why it is a bare timer, not a timeout frame.
                        await this.withRequestTimeout(crawlingContext, this.basicContextPipeline
                            .chain(this.contextPipeline)
                            .call(crawlingContext, (ctx) => this.handleRequest(ctx, source, request))));
                    }
                    catch (error) {
                        // ContextPipelineInterruptedError means the request was intentionally skipped
                        // (e.g., doesn't match enqueue strategy after redirect). Just return gracefully.
                        if (error instanceof ContextPipelineInterruptedError) {
                            this.statistics.discardJob(request.id || request.uniqueKey);
                            await this.timeoutAndRetry(async () => this.requestManager?.markRequestAsHandled(request), this.internalTimeoutMillis, `Marking request ${crawlingContext.request.url} (${crawlingContext.request.id}) as handled timed out after ${this.internalTimeoutMillis / 1e3} seconds.`);
                            return;
                        }
                        // If the error happened during pipeline initialization (e.g., navigation timeout, session/proxy error,
                        // i.e. not in user's requestHandler), handle it through the normal error flow. A bare `TimeoutError`
                        // here is the internal timeout above firing - anything else thrown inside the pipeline arrives wrapped.
                        const isPipelineError = error instanceof ContextPipelineInitializationError ||
                            error instanceof SessionError ||
                            error instanceof TimeoutError;
                        if (isPipelineError) {
                            const unwrappedError = this.unwrapError(error);
                            await this.requestFunctionErrorHandler(unwrappedError, crawlingContext, request, this.requestManager);
                            // SessionError already retired the session in `requestFunctionErrorHandler`;
                            // skip `markBad` to avoid double-counting usage/error score.
                            if (!this.errorAbsolvesSession(unwrappedError)) {
                                crawlingContext.session?.markBad();
                            }
                            return;
                        }
                        throw this.unwrapError(error);
                    }
                    finally {
                        // Run request-scoped deferred cleanups only after the whole request lifecycle - including the user's error handler - has finished.
                        const deferredCleanup = crawlingContext[deferredCleanupKey] ?? [];
                        await Promise.all(deferredCleanup.map((fn) => fn().catch((cleanupError) => this.log.debug('Error in deferred cleanup', { error: cleanupError }))));
                    }
                },
                isTaskReadyFunction: async () => {
                    if (isMaxPagesExceeded()) {
                        this.logOncePerRun('shuttingDown', 'Crawler reached the maxRequestsPerCrawl limit of ' +
                            `${this.#maxRequestsPerCrawl} requests and will shut down soon. Requests that are in progress will be allowed to finish.`);
                        return false;
                    }
                    if (this.#unexpectedStop) {
                        this.logOncePerRun('shuttingDown', 'No new requests are allowed because the `stop()` method has been called. ' +
                            'Ongoing requests will be allowed to complete.');
                        return false;
                    }
                    return isTaskReadyFunction ? await isTaskReadyFunction() : await this.isTaskReadyFunction();
                },
                isFinishedFunction: async () => {
                    if (isMaxPagesExceeded()) {
                        this.log.info(`Earlier, the crawler reached the maxRequestsPerCrawl limit of ${this.#maxRequestsPerCrawl} requests ` +
                            'and all requests that were in progress at that time have now finished. ' +
                            `In total, the crawler processed ${this.handledRequestsCount} requests and will shut down.`);
                        return true;
                    }
                    if (this.#unexpectedStop) {
                        this.log.info('The crawler has finished all the remaining ongoing requests and will shut down now.');
                        return true;
                    }
                    // Checked here because this runs only once nothing is in flight, which is exactly when a
                    // crawl that cannot progress looks indistinguishable from one that is merely waiting.
                    if (!keepAlive && supportsDomainThrottling(this.requestManager)) {
                        await this.requestManager.assertNoStalledDomains();
                    }
                    const isFinished = isFinishedFunction
                        ? await isFinishedFunction()
                        : await this.defaultIsFinishedFunction();
                    if (isFinished) {
                        const reason = isFinishedFunction
                            ? "Crawler's custom isFinishedFunction() returned true, the crawler will shut down."
                            : 'All requests from the queue have been processed, the crawler will shut down.';
                        this.log.info(reason);
                    }
                    return isFinished;
                },
                log: this.log,
            };
            this.#taskLoopOptions = { ...taskLoopOptions, ...crawlerOwnedTaskLoopConfiguration };
            this.#resolveConcurrencySystem = () => OwnedOrInjected.resolve(concurrencySystem, () => this.createDefaultConcurrencySystem({
                minConcurrency,
                maxConcurrency,
                maxTasksPerMinute: maxRequestsPerMinute,
                log: this.log,
            }));
        }
        finally {
            serviceLocatorScope.exitScope();
        }
    }
    /**
     * Builds the crawler-owned default {@apilink ConcurrencySystem} from the resolved
     * `minConcurrency`/`maxConcurrency`/`maxRequestsPerMinute` shortcuts. Not called when a
     * {@apilink BasicCrawlerOptions.concurrencySystem|`concurrencySystem`} was injected.
     *
     * Subclasses may override this to tune the default system (e.g. {@apilink HttpCrawler} raises the starting
     * concurrency and relaxes the event loop signal) while still honouring the user's shortcuts.
     */
    createDefaultConcurrencySystem(options) {
        return new ConcurrencySystem(options);
    }
    /**
     * Determines if the given HTTP status code is an error status code given
     * the default behaviour and user-set preferences.
     * @param status
     * @returns `true` if the status code is considered an error, `false` otherwise
     */
    isErrorStatusCode(status) {
        const excludeError = this.#ignoreHttpErrorStatusCodes.has(status);
        const includeError = this.additionalHttpErrorStatusCodes.has(status);
        return (status >= 500 && !excludeError) || includeError;
    }
    /**
     * Builds the basic context pipeline that transforms `{ request }` into a full `CrawlingContext`.
     * This handles base context creation, session resolution, and context helpers.
     */
    buildBasicContextPipeline() {
        return ContextPipeline.create()
            .compose({ action: this.checkRobotsTxt.bind(this) })
            .compose({ action: (context) => this.createBaseContext(context) })
            .compose({ action: this.resolveSession.bind(this) })
            .compose({ action: this.createContextHelpers.bind(this) });
    }
    async checkRobotsTxt({ request }) {
        if (!(await this.isAllowedBasedOnRobotsTxtFile(request.url))) {
            this.log.warning(`Skipping request ${request.url} (${request.id}) because it is disallowed based on robots.txt`);
            request.state = RequestState.SKIPPED;
            request.noRetry = true;
            await this.#handleSkippedRequest({
                url: request.url,
                reason: 'robotsTxt',
            });
            throw new ContextPipelineInterruptedError(`Skipping request ${request.url} as disallowed by robots.txt`);
        }
        return {};
    }
    /**
     * Builds the subclass-specific context pipeline that transforms a `CrawlingContext` into the crawler's target context type.
     * Subclasses should override this to add their own pipeline stages.
     */
    buildContextPipeline() {
        return ContextPipeline.create();
    }
    createBaseContext(context) {
        const deferredCleanup = [];
        return {
            id: cryptoRandomObjectId(10),
            log: this.log,
            pushData: this.pushData.bind(this),
            useState: this.useState.bind(this),
            getKeyValueStore: async (identifier) => KeyValueStore.open(identifier),
            registerDeferredCleanup: (cleanup) => {
                deferredCleanup.push(cleanup);
            },
            extendTimeout: (secs) => {
                const extraMillis = secs * 1000;
                // the current `addTimeoutToPromise` window (the request handler, or a navigation hook)...
                extendTimeout(extraMillis);
                // ...the internal timeout around the whole request, which is not an `addTimeoutToPromise` frame...
                context[extendTimeoutKey]?.(extraMillis);
                // ...and, when called from within the navigation phase, its shared window, so extending a hook
                // extends the whole navigation budget rather than just that hook's step.
                if (context[navigationDeadlineKey] !== undefined) {
                    context[navigationDeadlineKey] += extraMillis;
                }
            },
            [deferredCleanupKey]: deferredCleanup,
        };
    }
    async resolveRequest() {
        const request = await this.timeoutAndRetry(this.fetchNextRequest.bind(this), this.internalTimeoutMillis, `Fetching next request timed out after ${this.internalTimeoutMillis / 1e3} seconds.`);
        // Reset loadedUrl so an old one is not carried over to retries.
        if (request) {
            request.loadedUrl = undefined;
        }
        return request;
    }
    async resolveSession({ request }) {
        const session = await this.timeoutAndRetry(async () => {
            const existingSession = await this.sessionPool.getSession(request.sessionId);
            if (!existingSession) {
                throw new ContextPipelineInitializationError(new MissingSessionError(request.sessionId));
            }
            return existingSession;
        }, this.internalTimeoutMillis, `Fetching session timed out after ${this.internalTimeoutMillis / 1e3} seconds.`);
        return { session, proxyInfo: session?.proxyInfo };
    }
    async createContextHelpers({ request, session }) {
        const addRequests = async (requests, options = {}) => {
            const newCrawlDepth = request.crawlDepth + 1;
            const requestsGenerator = this.addCrawlDepthRequestGenerator(requests, newCrawlDepth);
            return await this.addRequests(requestsGenerator, options);
        };
        const sendRequest = createSendRequest(this.httpClient, request, session);
        return { addRequests, sendRequest };
    }
    buildFinalContextPipeline() {
        const subclassPipeline = (this.#contextPipelineOptions.contextPipelineBuilder?.() ??
            this.buildContextPipeline());
        // `extendContext` runs *before* the subclass navigation pipeline (which includes the
        // pre/post-navigation hooks). This makes the extension visible to those hooks and to the
        // request handler alike. The trade-off is that `extendContext` cannot access
        // navigation-dependent context members (e.g. `page`, `response`, `$`, `body`), as those
        // don't exist yet at this point in the pipeline.
        // The `extendContext` output (`ContextExtension`) is carried through the subclass pipeline at
        // runtime (the pipeline copies each middleware's returned members onto the shared context), but
        // TypeScript cannot express that `Context` transitively includes `ContextExtension` here. The
        // casts below are sound because `buildFinalContextPipeline` is declared to return the fully
        // resolved `ExtendedContext` (= `Context & ContextExtension`).
        const { extendContext } = this.#contextPipelineOptions;
        let contextPipeline;
        if (extendContext !== undefined) {
            contextPipeline = ContextPipeline.create()
                .compose({ action: async (context) => await extendContext(context) })
                .chain(subclassPipeline);
        }
        else {
            contextPipeline = subclassPipeline;
        }
        contextPipeline = contextPipeline.compose({
            action: async (context) => {
                const { request } = context;
                if (request && !this.requestMatchesEnqueueStrategy(request)) {
                    // eslint-disable-next-line dot-notation
                    const message = `Skipping request ${request.id} (starting url: ${request.url} -> loaded url: ${request.loadedUrl}) because it does not match the enqueue strategy (${request['enqueueStrategy']}).`;
                    this.log.debug(message);
                    request.noRetry = true;
                    request.state = RequestState.SKIPPED;
                    await this.#handleSkippedRequest({ url: request.url, reason: 'redirect' });
                    throw new ContextPipelineInterruptedError(message);
                }
                return context;
            },
        });
        return contextPipeline;
    }
    /**
     * Checks if the given error is a proxy error by comparing its message to a list of known proxy error messages.
     * Used for retrying requests that failed due to proxy errors.
     *
     * @param error The error to check.
     */
    isProxyError(error) {
        return ROTATE_PROXY_ERRORS.some((x) => this.getMessageFromError(error)?.includes(x));
    }
    /**
     * Sets the status message for the current crawler run.
     *
     * This method is periodically called by the crawler, every `statusMessageLoggingInterval` seconds.
     *
     * The message is logged and broadcast via the {@apilink EventType.STATUS_MESSAGE|`statusMessage`}
     * event. Integrations such as the Apify SDK subscribe to that event and forward the message to
     * their status-reporting backend (e.g. the Apify platform).
     */
    setStatusMessage(message, options = {}) {
        const data = options.isStatusMessageTerminal != null ? { terminal: options.isStatusMessageTerminal } : undefined;
        this.log.logWithLevel(LogLevel[options.level ?? 'DEBUG'], message, data);
        // Broadcast the status message through the event system. Consumers (e.g. the Apify SDK) can
        // subscribe to `EventType.STATUS_MESSAGE` and propagate it to their status-reporting backend.
        // Setting the status message is not a storage concern, so we intentionally don't route it
        // through the storage client anymore.
        serviceLocator.getEventManager().emit(EventType.STATUS_MESSAGE, {
            crawlerId: this.#identity.id,
            message,
            isStatusMessageTerminal: options.isStatusMessageTerminal,
            level: options.level,
        });
    }
    getPeriodicLogger() {
        let previousState = { ...this.statistics.state };
        const getOperationMode = () => {
            const { requestsFailed } = this.statistics.state;
            const { requestsFailed: previousRequestsFailed } = previousState;
            previousState = { ...this.statistics.state };
            const failedDelta = requestsFailed - previousRequestsFailed;
            if (failedDelta > 0) {
                return { mode: 'ERROR', failedDelta };
            }
            return { mode: 'REGULAR', failedDelta: 0 };
        };
        const log = async () => {
            const { mode: operationMode, failedDelta } = getOperationMode();
            let message;
            if (operationMode === 'ERROR') {
                message = `Experiencing problems, ${failedDelta} failed requests in the past ${this.#statusMessageLoggingInterval} seconds.`;
            }
            else {
                const total = await this.requestManager?.getTotalCount();
                message = `Crawled ${this.statistics.state.requestsFinished}${total ? `/${total}` : ''} pages, ${this.statistics.state.requestsFailed} failed requests, desired concurrency ${this.concurrencySystem?.desiredConcurrency ?? 0}.`;
            }
            if (this.#statusMessageCallback) {
                await this.#statusMessageCallback({
                    crawler: this,
                    state: this.statistics.state,
                    previousState,
                    message,
                });
                return;
            }
            this.setStatusMessage(message);
        };
        const interval = setInterval(log, this.#statusMessageLoggingInterval * 1e3);
        return { log, stop: () => clearInterval(interval) };
    }
    /**
     * Runs the crawler. Returns a promise that resolves once every request has been processed and the crawler's
     * finished-check ({@apilink BasicCrawlerOptions.taskLoopOptions|`taskLoopOptions.isFinishedFunction`}, or the
     * default "the request manager is empty") reports that the crawl is over.
     *
     * We can use the `requests` parameter to enqueue the initial requests — it is a shortcut for
     * running {@apilink BasicCrawler.addRequests|`crawler.addRequests()`} before {@apilink BasicCrawler.run|`crawler.run()`}.
     *
     * @param [requests] The requests to add.
     * @param [options] Options for the request queue.
     */
    async run(requests, options) {
        if (this.running) {
            throw new Error('This crawler instance is already running, you can add more requests to it via `crawler.addRequests()`.');
        }
        const { purgeRequestQueue, ...addRequestsOptions } = options ?? {};
        if (this.hasFinishedBefore) {
            // When executing the run method for the second time explicitly,
            // we need to purge the RQ to allow processing the same requests again — this is important so users can
            // pass in failed requests back to the `crawler.run()`, otherwise they would be considered as handled and
            // ignored — as a failed request is still handled.
            // By default (`purgeRequestQueue` unset), only the queue we opened ourselves is purged.
            // When `purgeRequestQueue` is explicitly `true`, we also purge a user-supplied manager.
            // When `purgeRequestQueue` is explicitly `false`, nothing is purged.
            const shouldPurge = purgeRequestQueue !== false;
            const managerToPurge = this.#ownedRequestQueue.maybeValue ?? (purgeRequestQueue === true ? this.requestManager : undefined);
            if (shouldPurge) {
                await managerToPurge?.purge?.();
                // The per-domain queues a `sameDomainDelaySecs` wrapper created are the crawler's own, whatever
                // sits underneath them - so they are emptied even when the manager they wrap is spared. Purging
                // the wrapper itself has already covered them.
                if (this.requestManager instanceof ThrottlingRequestManager && managerToPurge !== this.requestManager) {
                    await this.requestManager.purgeDomainQueues();
                }
            }
            // A supplied statistics instance keeps whatever state it was handed - only wipe a default we built.
            await this.#statisticsDep.ifOwned(async (stats) => {
                stats.reset();
                await stats.resetStore();
            });
            await this.#sessionPoolDep.ifOwned((pool) => pool.resetStore());
        }
        this.#unexpectedStop = false;
        this.running = true;
        this.#loggedPerRun.clear();
        await purgeDefaultStorages({
            onlyPurgeOnce: true,
            storageBackend: serviceLocator.getStorageBackend(),
            configuration: serviceLocator.getConfiguration(),
        });
        if (requests) {
            await this.addRequests(requests, addRequestsOptions);
        }
        try {
            await this.init();
            await this.statistics.startCapturing();
        }
        catch (error) {
            // Clean up here before propagating, otherwise a failed startup would leave the process hanging.
            await this.teardown().catch((teardownError) => {
                this.log.exception(teardownError, 'Cleaning up after a failed crawler startup failed.');
            });
            // The run never began, so let the instance be run again instead of leaving it wedged as `running`.
            this.running = false;
            throw error;
        }
        const periodicLogger = this.getPeriodicLogger();
        this.setStatusMessage('Starting the crawler.', { level: 'INFO' });
        const sigintHandler = async () => {
            this.log.warning('Pausing... Press CTRL+C again to force exit. To resume, do: CRAWLEE_PURGE_ON_START=0 npm start');
            await this.pauseOnMigration();
            await this.#autoscaledPool.abort();
        };
        // Attach a listener to handle migration and aborting events gracefully.
        const boundPauseOnMigration = this.pauseOnMigration.bind(this);
        process.once('SIGINT', sigintHandler);
        const eventManager = serviceLocator.getEventManager();
        eventManager.on(EventType.MIGRATING, boundPauseOnMigration);
        eventManager.on(EventType.ABORTING, boundPauseOnMigration);
        let stats = {};
        try {
            await this.#autoscaledPool.run();
        }
        finally {
            await this.statistics.stopCapturing();
            await this.teardown();
            process.off('SIGINT', sigintHandler);
            eventManager.off(EventType.MIGRATING, boundPauseOnMigration);
            eventManager.off(EventType.ABORTING, boundPauseOnMigration);
            const finalStats = this.statistics.calculate();
            stats = {
                requestsFinished: this.statistics.state.requestsFinished,
                requestsFailed: this.statistics.state.requestsFailed,
                retryHistogram: this.statistics.requestRetryHistogram,
                ...finalStats,
            };
            this.log.info('Final request statistics:', stats);
            if (this.statistics.errorTracker.total !== 0) {
                const prettify = ([count, info]) => `${count}x: ${info.at(-1).trim()} (${info[0]})`;
                this.log.info(`Error analysis:`, {
                    totalErrors: this.statistics.errorTracker.total,
                    uniqueErrors: this.statistics.errorTracker.getUniqueErrorCount(),
                    mostCommonErrors: this.statistics.errorTracker.getMostPopularErrors(3).map(prettify),
                });
            }
            const client = serviceLocator.getStorageBackend();
            if (client.teardown) {
                let finished = false;
                setTimeout(() => {
                    if (!finished) {
                        this.log.info('Waiting for the storage to write its state to file system.');
                    }
                }, 1000);
                await client.teardown();
                finished = true;
            }
            periodicLogger.stop();
            this.setStatusMessage(`Finished! Total ${this.statistics.state.requestsFinished + this.statistics.state.requestsFailed} requests: ${this.statistics.state.requestsFinished} succeeded, ${this.statistics.state.requestsFailed} failed.`, { isStatusMessageTerminal: true, level: 'INFO' });
            this.running = false;
            this.hasFinishedBefore = true;
        }
        return stats;
    }
    /**
     * Gracefully stops the current run of the crawler.
     *
     * All the tasks active at the time of calling this method will be allowed to finish.
     *
     * To stop the crawler immediately, use {@apilink BasicCrawler.teardown|`crawler.teardown()`} instead.
     */
    stop(reason = 'The crawler has been gracefully stopped.') {
        if (this.#unexpectedStop) {
            return;
        }
        this.log.info(reason);
        this.#unexpectedStop = true;
    }
    /**
     * Stops dispatching new requests, letting the in-progress ones finish. Resolves once they have settled, or rejects
     * after `timeoutSecs` if they take too long. Unlike {@apilink BasicCrawler.stop|`stop()`}, this does not end the
     * run — {@apilink BasicCrawler.run|`run()`} stays pending until {@apilink BasicCrawler.resume|`resume()`}.
     *
     * > *NOTE:* The {@apilink BasicCrawler.concurrencySystem|concurrency system} keeps monitoring and autoscaling
     * throughout, since a shared one may still be serving other crawlers.
     */
    async pause(timeoutSecs) {
        if (!this.#autoscaledPool) {
            this.log.warning('Cannot pause a crawler that is not running.');
            return;
        }
        await this.#autoscaledPool.pause(timeoutSecs);
    }
    /**
     * Resumes a run suspended with {@apilink BasicCrawler.pause|`pause()`}, letting the crawler dispatch requests
     * again. A no-op on a crawler that is not paused.
     */
    resume() {
        if (!this.#autoscaledPool) {
            this.log.warning('Cannot resume a crawler that is not running.');
            return;
        }
        this.#autoscaledPool.resume();
    }
    /**
     * Returns the crawler's {@apilink IRequestManager|request manager}, opening the default {@apilink RequestQueue}
     * if none has been configured or opened yet.
     */
    async getRequestManager() {
        if (!this.requestManager) {
            this.requestManager = await this.openOwnedRequestQueue();
        }
        // Wrapped here rather than in the constructor, because the manager being wrapped may only be opened at
        // this point - and because everything that enqueues goes through here first, so nothing slips past the
        // wrapper into the queue it hides.
        if (this.#sameDomainDelaySecs > 0 && !supportsDomainThrottling(this.requestManager)) {
            this.requestManager = new ThrottlingRequestManager({
                inner: this.requestManager,
                domains: 'all',
                minCrawlDelaySecs: this.#sameDomainDelaySecs,
                // What `sameDomainDelaySecs` has always meant: one clock for a site, subdomains included.
                throttleBy: 'registrableDomain',
                persistStateKey: `CRAWLEE_THROTTLED_DOMAINS_${this.#identity.id}`,
            });
        }
        // Apply the processing-time hint here (an async lifecycle point) rather than in the constructor,
        // now that `setExpectedRequestProcessingTimeSecs` is async. The hint is raise-only and idempotent,
        // but guard so we do not re-issue it on every call.
        if (!this.#requestManagerTimeoutsApplied) {
            this.#requestManagerTimeoutsApplied = true;
            await this.applyRequestManagerTimeouts(this.requestManager);
        }
        return this.requestManager;
    }
    /**
     * @deprecated Use {@apilink BasicCrawler.getRequestManager|`getRequestManager()`} instead. This returns the
     * crawler's request manager, which is no longer guaranteed to be a {@apilink RequestQueue}.
     */
    async getRequestQueue() {
        return this.getRequestManager();
    }
    /**
     * Opens the default {@apilink RequestQueue}, applies the crawler's timeouts to it and records it as the
     * crawler-owned queue (so it gets purged between repeated `run()` calls).
     * @private
     */
    async openOwnedRequestQueue() {
        // The first crawler instance uses the default queue (null identifier);
        // subsequent instances get their own queue via a unique alias so they don't collide.
        const identifier = this.#identity.instanceIndex === 0 ? null : { alias: `__default_${this.#identity.id}__` };
        const requestQueue = await RequestQueue.open(identifier, { configuration: serviceLocator.getConfiguration() });
        return this.#ownedRequestQueue.set(requestQueue);
    }
    /**
     * Tells a request manager how long we expect to hold a fetched request, so that one backed by a
     * locking storage backend keeps it reserved for slightly longer than the request handler timeout
     * (with some padding for overhead), but never for less than a minute. This prevents a long-running
     * request from being handed out a second time while it is still being processed — and it works
     * regardless of whether the manager is a plain {@apilink RequestQueue} or a `RequestManagerTandem`.
     */
    async applyRequestManagerTimeouts(requestManager) {
        // A router route may hold a request for longer than the crawler's own timeout, and we cannot know
        // which routes a run will hit, so reserve for the longest one any route asked for. The hint is
        // raise-only, so erring high here is safe.
        const maxRouteTimeoutSecs = this.requestHandler.getMaxTimeoutSecs?.() ?? 0;
        const handlerTimeoutSecs = Math.max(this.requestHandlerTimeoutMillis / 1000, maxRouteTimeoutSecs);
        await requestManager.setExpectedRequestProcessingTimeSecs?.(Math.max(handlerTimeoutSecs + 5, 60));
    }
    /**
     * Validates a request source's `userData` against the {@apilink RouteSchemas|Standard Schema} registered
     * for its label on the crawler's schema-router (if any), throwing a {@apilink RequestValidationError} on
     * mismatch. A no-op when the user's request handler is not a schema-router, or no schema is registered for
     * the request's label. Applied by the crawler on the add paths it owns — `crawler.addRequests`,
     * `crawler.run`, `context.addRequests` and `context.enqueueLinks`.
     */
    async validateRequestUserData(source) {
        if (typeof source === 'string') {
            return;
        }
        const getSchema = this.requestHandler.getSchema;
        if (typeof getSchema !== 'function') {
            return;
        }
        // Resolve the label via its public accessors only — the top-level `label` of a `RequestOptions` or the
        // `Request.label` getter — rather than reaching into `userData`, where the request happens to store it.
        const target = source;
        const schema = getSchema(target.label);
        if (!schema) {
            return;
        }
        // Store the parsed value rather than the raw input, so the queue holds the same coerced `userData` the
        // handler will see. Assigning through a `Request` instance's setter keeps its internal `__crawlee` meta.
        target.userData = await validateUserData(target.label, schema, target.userData ?? {});
    }
    async useState(defaultValue = {}) {
        const kvs = await KeyValueStore.open(null, { configuration: serviceLocator.getConfiguration() });
        if (this.#identity.hasExplicitId) {
            const stateKey = `${BasicCrawler.#CRAWLEE_STATE_KEY}_${this.#identity.id}`;
            return kvs.getAutoSavedValue(stateKey, defaultValue);
        }
        BasicCrawler.#useStateAnonymousIndices.add(this.#identity.instanceIndex);
        if (BasicCrawler.#useStateAnonymousIndices.size > 1) {
            serviceLocator
                .getLogger()
                .warningOnce('Multiple crawler instances are calling useState() without an explicit `id` option. \n' +
                'This means they will share the same state object, which is likely unintended. \n' +
                'To fix this, provide a unique `id` option to each crawler instance. \n' +
                'Example: new BasicCrawler({ id: "my-crawler-1", ... })');
        }
        return kvs.getAutoSavedValue(BasicCrawler.#CRAWLEE_STATE_KEY, defaultValue);
    }
    async #getPendingRequestCountApproximation() {
        return (await this.requestManager?.getPendingCount()) ?? 0;
    }
    async #calculateEnqueuedRequestLimit(explicitLimit) {
        if (this.#maxRequestsPerCrawl === undefined) {
            return explicitLimit;
        }
        const limit = Math.max(0, this.#maxRequestsPerCrawl - this.handledRequestsCount - (await this.#getPendingRequestCountApproximation()));
        return Math.min(limit, explicitLimit ?? Infinity);
    }
    async #handleSkippedRequest(options) {
        // A skipped request is a *successful* outcome, but the interrupt still unwinds through the
        // transaction scope, which rolls back - so the skip bookkeeping must write directly.
        await withDirectStorageAccess(async () => {
            if (options.reason === 'limit') {
                this.logOncePerRun('maxRequestsPerCrawl', 'The number of requests enqueued by the crawler reached the maxRequestsPerCrawl limit of ' +
                    `${this.#maxRequestsPerCrawl} requests and no further requests will be added.`);
            }
            if (options.reason === 'depth') {
                this.logOncePerRun('maxCrawlDepth', `The crawler reached the maxCrawlDepth limit of ${this.#maxCrawlDepth} and no further requests will be enqueued.`);
            }
            await this.#onSkippedRequest?.(options);
        });
    }
    logOncePerRun(key, message, level = 'info') {
        if (!this.#loggedPerRun.has(key)) {
            this.log[level](message);
            this.#loggedPerRun.add(key);
        }
    }
    /**
     * Adds requests to the queue in batches. By default, it will resolve after the initial batch is added, and continue
     * adding the rest in background. You can configure the batch size via `batchSize` option and the sleep time in between
     * the batches via `waitBetweenBatchesMillis`. If you want to wait for all batches to be added to the queue, you can use
     * the `waitForAllRequestsToBeAdded` promise you get in the response object.
     *
     * Optionally, the requests can be filtered using `include`/`exclude` glob or regexp patterns and an
     * enqueue `strategy` (both AND-ed together, same as {@apilink CrawlingContext.enqueueLinks|`enqueueLinks`}),
     * relative to `baseUrl`. Unlike `enqueueLinks`, there is no implicit "current page" to anchor the strategy
     * to, so `strategy` defaults to {@apilink EnqueueStrategy.All|`all`} here.
     *
     * This is an alias for calling `addRequestsBatched()` on the implicit `RequestQueue` for this crawler instance.
     *
     * @param requests The requests to add
     * @param options Options for the request queue
     */
    async addRequests(requests, options = {}) {
        await this.getRequestManager();
        if (!isIterable(requests) && !isAsyncIterable(requests)) {
            throw new Error(`Expected an iterable or async iterable, got ${getObjectType(requests)}`);
        }
        parseArgument(options, addRequestsOptionsSchema, 'EnqueueUrlsOptions');
        // `label`/`userData` apply to every request this call produces, so a single upfront validation
        // against the label's schema covers them all and fails the whole call fast, rather than failing
        // lazily once the generator below is drained. Skipped when neither is set - each item still gets
        // its own per-item validation below, and validating an absent label/userData here would spuriously
        // check them against a registered default-route schema.
        if (options.label !== undefined || options.userData !== undefined) {
            await this.validateRequestUserData({ label: options.label, userData: options.userData });
        }
        const requestLimit = await this.#calculateEnqueuedRequestLimit(options.limit);
        const strategy = options.strategy ?? EnqueueStrategy.All;
        const urlExcludePatternObjects = options.exclude?.length
            ? constructUrlPatternObjects(options.exclude)
            : [];
        const urlPatternObjects = options.include?.length
            ? constructUrlPatternObjects(options.include)
            : [];
        // The strategy always applies, even when `include` patterns are provided - the two are AND-ed together
        // (a URL must match an `include` pattern *and* satisfy the strategy). This mirrors crawlee-python.
        const enqueueStrategyPatterns = options.baseUrl
            ? buildEnqueueStrategyPatterns(options.baseUrl, strategy)
            : [];
        const isAllowedBasedOnRobotsTxtFile = this.isAllowedBasedOnRobotsTxtFile.bind(this);
        const maxCrawlDepth = this.#maxCrawlDepth;
        const validateRequestUserData = this.validateRequestUserData.bind(this);
        const allSkipped = [];
        async function* filteredRequests() {
            for await (const request of requests) {
                const [requestOptions] = createRequestOptions([typeof request === 'string' ? request : request], { ...options, strategy });
                if (!requestOptions) {
                    continue; // invalid URL, silently dropped (matches `createRequestOptions`'s own filtering)
                }
                if (maxCrawlDepth !== undefined && requestOptions.crawlDepth > maxCrawlDepth) {
                    allSkipped.push({ url: requestOptions.url, reason: 'depth' });
                    continue;
                }
                if (!(await isAllowedBasedOnRobotsTxtFile(requestOptions.url))) {
                    allSkipped.push({ url: requestOptions.url, reason: 'robotsTxt' });
                    continue;
                }
                const onSkippedFilterUrl = (url) => allSkipped.push({ url, reason: 'filters' });
                // Filter by user patterns first (with exclude)...
                let filtered = filterRequestOptionsByPatterns([requestOptions], urlPatternObjects.length > 0 ? urlPatternObjects : undefined, urlExcludePatternObjects, strategy, onSkippedFilterUrl);
                // ...then filter by the enqueue strategy (making this an AND check)
                filtered = filterRequestOptionsByPatterns(filtered, enqueueStrategyPatterns.length > 0 ? enqueueStrategyPatterns : undefined, [], strategy, onSkippedFilterUrl);
                if (filtered.length === 0) {
                    continue;
                }
                let [finalOptions] = filtered;
                if (options.transformRequestFunction) {
                    const transformed = applyRequestTransform([finalOptions], options.transformRequestFunction, (r) => allSkipped.push({ url: r.url, reason: r.skippedReason ?? 'transform' }));
                    if (transformed.length === 0) {
                        continue;
                    }
                    [finalOptions] = transformed;
                }
                await validateRequestUserData(finalOptions);
                yield new Request(finalOptions);
            }
        }
        const result = await this.requestManager.addRequestsBatched(filteredRequests(), {
            forefront: options.forefront,
            waitForAllRequestsToBeAdded: options.waitForAllRequestsToBeAdded,
            batchSize: options.batchSize,
            waitBetweenBatchesMillis: options.waitBetweenBatchesMillis,
            maxNewRequests: requestLimit,
        });
        // Report requests skipped due to the maxNewRequests budget (i.e. maxRequestsPerCrawl limit, or an
        // explicit `limit` option)
        for (const request of result.requestsOverLimit ?? []) {
            allSkipped.push({ url: typeof request === 'string' ? request : request.url, reason: 'limit' });
        }
        if (allSkipped.length > 0) {
            const skippedRobotsUrls = allSkipped.filter((s) => s.reason === 'robotsTxt').map((s) => s.url);
            if (skippedRobotsUrls.length > 0) {
                this.log.warning(`Some requests were skipped because they were disallowed based on the robots.txt file`, { skipped: skippedRobotsUrls });
            }
            // Only log the limit message when an explicit `limit` was passed (not the internal
            // `maxRequestsPerCrawl`-derived one), and only once per call.
            if (options.limit !== undefined && allSkipped.some((s) => s.reason === 'limit')) {
                this.log.info(requestLimit === options.limit
                    ? `Skipping requests in this call due to the enqueueLinks limit of ${options.limit}.`
                    : `Skipping requests in this call due to the remaining maxRequestsPerCrawl budget of ${requestLimit}, which is lower than the enqueueLinks limit of ${options.limit}.`);
            }
            await Promise.all(allSkipped.map(async ({ url, reason }) => {
                await this.#handleSkippedRequest({ url, reason });
                await options.onSkippedRequest?.({ url, reason });
            }));
        }
        return result;
    }
    /**
     * Pushes data to the specified {@apilink Dataset}, or the default crawler {@apilink Dataset} by calling {@apilink Dataset.pushData}.
     */
    async pushData(data, datasetIdentifier) {
        const dataset = await this.getDataset(datasetIdentifier);
        return dataset.pushData(data);
    }
    /**
     * Retrieves the specified {@apilink Dataset}, or the default crawler {@apilink Dataset}.
     */
    async getDataset(identifier) {
        return Dataset.open(identifier, {
            configuration: serviceLocator.getConfiguration(),
        });
    }
    /**
     * Retrieves data from the default crawler {@apilink Dataset} by calling {@apilink Dataset.getData}.
     */
    async getData(...args) {
        const dataset = await this.getDataset();
        return dataset.getData(...args);
    }
    /**
     * Retrieves all the data from the default crawler {@apilink Dataset} and exports them to the specified format.
     * Supported formats are currently 'json' and 'csv', and will be inferred from the `path` automatically.
     */
    async exportData(path, format, options) {
        const supportedFormats = ['json', 'csv'];
        const formatMatch = /\.(json|csv)$/i.exec(path);
        if (!format && formatMatch) {
            format = formatMatch[1].toLowerCase();
        }
        if (!format) {
            throw new Error(`Failed to infer format from the path: '${path}'. Supported formats: ${supportedFormats.join(', ')}`);
        }
        if (!supportedFormats.includes(format)) {
            throw new Error(`Unsupported format: '${format}'. Use one of ${supportedFormats.join(', ')}`);
        }
        const dataset = await this.getDataset();
        const items = await dataset.export(options);
        if (format === 'csv') {
            let value;
            if (items.length === 0) {
                value = '';
            }
            else {
                const keys = options?.collectAllKeys
                    ? Array.from(new Set(items.flatMap(Object.keys)))
                    : Object.keys(items[0]);
                const { stringify } = await import('csv-stringify/sync');
                value = stringify([
                    keys,
                    ...items.map((item) => {
                        return keys.map((k) => item[k]);
                    }),
                ]);
            }
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, value);
            this.log.info(`Export to ${path} finished!`);
        }
        if (format === 'json') {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, `${JSON.stringify(items, null, 4)}\n`);
            this.log.info(`Export to ${path} finished!`);
        }
        return items;
    }
    /**
     * Initializes the crawler.
     */
    async init() {
        const eventManager = serviceLocator.getEventManager();
        if (!eventManager.isInitialized()) {
            await eventManager.init();
            this.#closeEvents = true;
        }
        // Warn once at startup if the internal timeout is shorter than the phases it is meant to outlast. It is
        // floored per request so it will not actually cut them short, but the configured value is then effectively
        // ignored, which is worth flagging. Checked here (not in the constructor) because a subclass sets its
        // navigation timeout only after `super()`.
        const phasesMillis = this.getNavigationTimeoutMillis() + this.resolveRequestHandlerTimeoutMillis(undefined);
        if (this.internalTimeoutMillis < phasesMillis) {
            this.log.warning(`CRAWLEE_INTERNAL_TIMEOUT (${this.internalTimeoutMillis / 1000}s) is shorter than the navigation ` +
                `and request handler timeouts combined (${phasesMillis / 1000}s); it will be raised per request ` +
                `so it does not cut them short.`);
        }
        // An owned governor is rebuilt (and started) for every run, so it always starts from a clean slate — stale
        // resource snapshots or a previous run's scaled desired concurrency would otherwise distort this run's
        // scaling. An injected one is long-lived and its lifecycle belongs to the caller.
        this.#concurrencySystemDep = this.#resolveConcurrencySystem();
        await this.#concurrencySystemDep.ifOwned((system) => system.start());
        this.#autoscaledPool = new AutoscaledPool({
            ...this.#taskLoopOptions,
            concurrencySystem: this.#concurrencySystemDep.value,
            consumer: this.#identity,
        });
        await this.getRequestManager();
    }
    /**
     * The navigation timeout (pre-navigation hooks, navigation, and post-navigation hooks) in milliseconds, used
     * to size the internal request timeout. `BasicCrawler` has no navigation phase, so this is 0; the HTTP and
     * browser crawlers override it with their `navigationTimeoutSecs`.
     */
    getNavigationTimeoutMillis() {
        return 0;
    }
    /**
     * Races the request against the internal timeout (see {@apilink raceWithTimeout}), sized to outlast the phases
     * that have their own timeout - the navigation, its hooks, and the request handler - so a legitimately slow
     * request, a per-route override, or a low `CRAWLEE_INTERNAL_TIMEOUT` is not cut short mid-phase. It takes
     * whichever is larger: the configured internal timeout, or this request's combined phase budget.
     */
    async withRequestTimeout(crawlingContext, work) {
        const { request } = crawlingContext;
        const phasesMillis = this.getNavigationTimeoutMillis() + this.resolveRequestHandlerTimeoutMillis(request.label);
        const timeoutMillis = Math.max(this.internalTimeoutMillis, phasesMillis);
        await raceWithTimeout(crawlingContext, work, { timeoutMillis, requestId: request.id });
    }
    /**
     * The request handler timeout for a request with the given route label. A router route may override the
     * crawler's own `requestHandlerTimeoutSecs`; anything else falls back to `fallbackMillis`.
     *
     * @param label The request's route label, or `undefined` for the default route / no specific request.
     * @param fallbackMillis Timeout to use when no route overrides it.
     */
    resolveRequestHandlerTimeoutMillis(label, fallbackMillis = this.requestHandlerTimeoutMillis) {
        return this.getRouteTimeoutMillis(label) ?? fallbackMillis;
    }
    /**
     * The timeout the router route with the given label asked for, or `undefined` when it did not override one
     * (or the request handler is not a router at all).
     */
    getRouteTimeoutMillis(label) {
        const getTimeoutSecs = this.requestHandler.getTimeoutSecs;
        if (typeof getTimeoutSecs !== 'function') {
            return undefined;
        }
        const timeoutSecs = getTimeoutSecs(label);
        return timeoutSecs === undefined ? undefined : timeoutSecs * 1000;
    }
    async runRequestHandler(crawlingContext) {
        const timeoutMillis = this.resolveRequestHandlerTimeoutMillis(crawlingContext.request.label);
        await addTimeoutToPromise(async () => this.requestHandler(crawlingContext), timeoutMillis, `requestHandler timed out after ${timeoutMillis / 1000} seconds (${crawlingContext.request.id}).`);
    }
    /**
     * Runs `callback` inside a {@apilink StorageTransaction}, unless transactional storage is disabled.
     * Deliberately does **not** commit on return - `handleRequest` swallows request handler failures, so
     * a normal return says nothing about success. `handleRequest` owns the outcome.
     */
    async runInStorageTransaction(callback) {
        if (!this.#transactionalStorageEnabled) {
            return callback();
        }
        const transaction = createStorageTransaction({
            policy: this.#storageWritePolicy,
            commitTimeoutMillis: this.internalTimeoutMillis,
        });
        let threw = true;
        try {
            const result = await transaction.run(callback);
            threw = false;
            return result;
        }
        finally {
            if (transaction.state === 'open') {
                // `handleRequest` commits or rolls back on every normal path, so an open transaction on
                // a normal return is a wiring bug; on a propagating throw (a pipeline-level failure) it is
                // expected. Either way, discard the unvalidated writes; only the former is worth flagging.
                if (!threw) {
                    this.log.error('Internal error: a storage transaction was still open after the request pipeline ' +
                        'returned normally. Its writes are being discarded. Please report this.');
                }
                transaction.rollback();
            }
            // Unconditional: `failed` is a terminal state that the branch above never reaches.
            transaction.dispose();
        }
    }
    /**
     * Handles blocked request
     */
    throwOnBlockedRequest(statusCode) {
        if (this.retryOnBlocked)
            return;
        if (this.blockedStatusCodes.has(statusCode)) {
            throw new SessionError(`Request blocked - received ${statusCode} status code.`);
        }
    }
    async isAllowedBasedOnRobotsTxtFile(url) {
        if (!this.#respectRobotsTxtFile) {
            return true;
        }
        const robotsTxtFile = await this.getRobotsTxtFileForUrl(url);
        const userAgent = typeof this.#respectRobotsTxtFile === 'object' ? this.#respectRobotsTxtFile?.userAgent : '*';
        if (robotsTxtFile) {
            const crawlDelay = robotsTxtFile.getCrawlDelay(userAgent);
            if (crawlDelay !== undefined) {
                this.applyCrawlDelay(url, crawlDelay);
            }
        }
        return !robotsTxtFile || robotsTxtFile.isAllowed(url, userAgent);
    }
    /**
     * Records an HTTP 429 against the URL's domain so the request manager can pace the retry.
     *
     * @param retryAfterHeader The raw `Retry-After` response header, if the server sent one.
     * @returns `true` if a manager took responsibility for the delay, in which case the caller should throw
     *  {@apilink RequestThrottledError} rather than treating the response as a blocked session.
     */
    recordDomainRateLimit(url, retryAfterHeader) {
        if (supportsDomainThrottling(this.requestManager) &&
            this.requestManager.recordDomainDelay(url, parseRetryAfterHeader(retryAfterHeader))) {
            return true;
        }
        const domain = hostnameOrUrl(url);
        this.logOncePerRun(`rateLimitNotThrottled:${domain}`, `"${domain}" responded with HTTP 429 (Too Many Requests), but nothing is set up to back off from it, ` +
            'so the response is handled like any other, with no per-domain delay. ' +
            `Pass a \`ThrottlingRequestManager\` as \`requestManager\` and include "${domain}" in its \`domains\` ` +
            'option to honour `Retry-After` and apply exponential backoff instead.', 'warning');
        return false;
    }
    /**
     * Hands a robots.txt `Crawl-delay` to the request manager, warning if nothing is able to honour it.
     *
     * The warning is driven by whether the delay was actually accepted rather than by the type of the manager,
     * because a manager that does throttle still drops the delay for a domain missing from its `domains` list.
     */
    applyCrawlDelay(url, delaySeconds) {
        if (supportsDomainThrottling(this.requestManager) && this.requestManager.setCrawlDelay(url, delaySeconds)) {
            return;
        }
        const domain = hostnameOrUrl(url);
        this.logOncePerRun(`crawlDelayIgnored:${domain}`, `robots.txt for "${domain}" defines a crawl-delay of ${delaySeconds}s, but nothing is set up to honour it, ` +
            'so requests to that domain will not be paced. Pass a `ThrottlingRequestManager` as `requestManager` ' +
            `and include "${domain}" in its \`domains\` option to enforce the delay.`, 'warning');
    }
    async getRobotsTxtFileForUrl(url) {
        if (!this.#respectRobotsTxtFile) {
            return undefined;
        }
        try {
            const origin = new URL(url).origin;
            const cachedRobotsTxtFile = this.#robotsTxtFileCache.get(origin);
            if (cachedRobotsTxtFile) {
                return cachedRobotsTxtFile;
            }
            const robotsTxtFile = await RobotsTxtFile.find(url, { logger: this.log });
            this.#robotsTxtFileCache.add(origin, robotsTxtFile);
            return robotsTxtFile;
        }
        catch (e) {
            this.log.warning(`Failed to fetch robots.txt for request ${url}`);
            return undefined;
        }
    }
    async pauseOnMigration() {
        if (this.#autoscaledPool) {
            // if run wasn't called, this is going to crash
            await this.#autoscaledPool.pause(SAFE_MIGRATION_WAIT_MILLIS).catch((err) => {
                if (err.message.includes('running tasks did not finish')) {
                    this.log.error('The crawler was paused due to migration to another host, ' +
                        "but some requests did not finish in time. Those requests' results may be duplicated.");
                }
                else {
                    throw err;
                }
            });
        }
        const requestManagerPersistPromise = (async () => {
            // The request manager persists its read-only loader's state, if it has one that supports persistence
            // (e.g. a tandem wrapping a `RequestList`). For a plain `RequestQueue`, this is a no-op.
            if (this.requestManager?.persistState) {
                if (await this.requestManager.isFinished())
                    return;
                await this.requestManager.persistState().catch((err) => {
                    if (err.message.includes('Cannot persist state.')) {
                        this.log.error("The crawler attempted to persist its request list's state and failed due to missing or " +
                            'invalid configuration. Make sure to use either RequestList.open() or the "stateKeyPrefix" option of RequestList ' +
                            'constructor to ensure your crawling state is persisted through host migrations and restarts.');
                    }
                    else {
                        this.log.exception(err, 'An unexpected error occurred when the crawler ' +
                            "attempted to persist its request list's state.");
                    }
                });
            }
        })();
        await Promise.all([requestManagerPersistPromise, this.statistics.persistState?.()]);
    }
    /**
     * Fetches the next request to process from the underlying request provider.
     */
    async fetchNextRequest() {
        if (this.requestManager === undefined) {
            throw new Error(`fetchNextRequest called on an uninitialized crawler`);
        }
        return this.requestManager.fetchNextRequest();
    }
    /** Handles a single request - runs the request handler with retries, error handling, and lifecycle management. */
    async handleRequest(crawlingContext, requestSource, request) {
        // An earlier phase we cannot cancel (e.g. a slow `extendContext`) may have run past the internal timeout,
        // which already failed the request in `runTaskFunction`. Bail before running the handler so it does not
        // execute (and re-report) on top of a request the crawler has already moved past.
        if (crawlingContext[timeoutExpiredKey]?.()) {
            return;
        }
        const statisticsId = request.id || request.uniqueKey;
        // Opened by `runInStorageTransaction`; absent when disabled or when the subclass opens its own.
        const transaction = currentStorageTransaction();
        let isRequestLocked = true;
        try {
            request.state = RequestState.REQUEST_HANDLER;
            await this.runRequestHandler(crawlingContext);
            // Commit *before* marking the request as handled, so a commit failure fails the request and
            // it is retried. This also closes the transaction, so everything below passes through.
            await transaction?.commit();
            await this.timeoutAndRetry(async () => requestSource.markRequestAsHandled(request), this.internalTimeoutMillis, `Marking request ${request.url} (${request.id}) as handled timed out after ${this.internalTimeoutMillis / 1e3} seconds.`);
            isRequestLocked = false; // markRequestAsHandled succeeded and unlocked the request
            this.statistics.finishJob(statisticsId, request.retryCount);
            // reclaim session if request finishes successfully
            request.state = RequestState.DONE;
            crawlingContext.session.markGood();
        }
        catch (rawError) {
            // Roll back *before* any error handler runs - error handlers write to real storage precisely
            // because the transaction is already closed. A no-op when the commit above succeeded.
            transaction?.rollback();
            const err = this.unwrapError(rawError);
            try {
                request.state = RequestState.ERROR_HANDLER;
                await addTimeoutToPromise(async () => this.requestFunctionErrorHandler(err, crawlingContext, request, requestSource), this.internalTimeoutMillis, `Handling request failure of ${request.url} (${request.id}) timed out after ${this.internalTimeoutMillis / 1e3} seconds.`);
                if (!(err instanceof CriticalError)) {
                    isRequestLocked = false; // requestFunctionErrorHandler calls either markRequestAsHandled or reclaimRequest
                }
                request.state = RequestState.DONE;
            }
            catch (secondaryError) {
                const unwrappedSecondaryError = this.unwrapError(secondaryError);
                if (!unwrappedSecondaryError.triggeredFromUserHandler &&
                    // avoid reprinting the same critical error multiple times, as it will be printed by Nodejs at the end anyway
                    !(unwrappedSecondaryError instanceof CriticalError)) {
                    const apifySpecific = process.env.APIFY_IS_AT_HOME
                        ? `This may have happened due to an internal error of Apify's API or due to a misconfigured crawler.`
                        : '';
                    this.log.exception(unwrappedSecondaryError, 'An exception occurred during handling of failed request. ' +
                        `This places the crawler and its underlying storages into an unknown state and crawling will be terminated. ${apifySpecific}`);
                }
                request.state = RequestState.ERROR;
                throw unwrappedSecondaryError;
            }
            // decrease the session score if the request fails (but the error handler did not throw);
            // skip when the error is a SessionError, which already retired the session
            if (!this.errorAbsolvesSession(err)) {
                crawlingContext.session.markBad();
            }
        }
        finally {
            // Safety net - return the request to the queue if nobody managed to mark it as handled
            // or reclaim it before (e.g. after a CriticalError). Reclaiming a request that is no longer
            // in progress is a harmless no-op on the storage backend.
            if (isRequestLocked && requestSource instanceof RequestQueue) {
                try {
                    await requestSource.reclaimRequest(request);
                }
                catch {
                    // The request was never in progress, or could not be reclaimed. Either way it's fine.
                }
            }
        }
    }
    /**
     * Generator function that yields requests injected with the given crawl depth.
     * @internal
     */
    async *addCrawlDepthRequestGenerator(requests, newRequestDepth) {
        for await (const request of requests) {
            if (typeof request === 'string') {
                yield { url: request, crawlDepth: newRequestDepth };
            }
            else {
                request.crawlDepth ??= newRequestDepth;
                yield request;
            }
        }
    }
    /**
     * Run async callback with given timeout and retry. Returns the result of the callback.
     * @ignore
     */
    async timeoutAndRetry(handler, timeout, error, maxRetries = 3, retried = 1) {
        try {
            return await addTimeoutToPromise(handler, timeout, error);
        }
        catch (e) {
            if (retried <= maxRetries) {
                // we retry on any error, not just timeout
                this.log.warning(`${e.message} (retrying ${retried}/${maxRetries})`);
                return this.timeoutAndRetry(handler, timeout, error, maxRetries, retried + 1);
            }
            throw e;
        }
    }
    /**
     * Returns true if either RequestList or RequestQueue have a request ready for processing.
     */
    async isTaskReadyFunction() {
        return this.requestManager !== undefined && !(await this.requestManager.isEmpty());
    }
    /**
     * Returns true if both RequestList and RequestQueue have all requests finished.
     */
    async defaultIsFinishedFunction() {
        return !this.requestManager || (await this.requestManager.isFinished());
    }
    /**
     * Unwraps errors thrown by the context pipeline to get the actual user error.
     * RequestHandlerError and ContextPipelineInitializationError wrap the actual error.
     */
    unwrapError(error) {
        if (error instanceof RequestHandlerError ||
            error instanceof ContextPipelineInitializationError ||
            error instanceof ContextPipelineCleanupError) {
            return this.unwrapError(error.cause);
        }
        return error;
    }
    /**
     * Handles errors thrown by user provided requestHandler()
     *
     * @param request The request object, passed separately to circumvent potential dynamic logic in crawlingContext.request
     */
    async requestFunctionErrorHandler(error, crawlingContext, request, source) {
        if (error instanceof RequestThrottledError) {
            // The domain told us to come back later, so the request was never really attempted. Put it back
            // without recording a failure - it costs neither a retry nor session reputation.
            this.log.debug(`Deferring request because its domain is rate-limiting us. ${error.message}`, {
                id: request.id,
                url: request.url,
            });
            await source.reclaimRequest(request, { forefront: request.userData?.__crawlee?.forefront });
            return;
        }
        request.pushErrorMessage(error);
        if (error instanceof CriticalError) {
            throw error;
        }
        const shouldRetryRequest = this.canRequestBeRetried(request, error);
        if (shouldRetryRequest) {
            await this.statistics.errorTrackerRetry.addAsync(error, crawlingContext);
            await this.errorHandler?.(crawlingContext, // valid cast - ExtendedContext transitively extends CrawlingContext
            error);
            if (error instanceof SessionError) {
                crawlingContext.session?.retire();
            }
            if (!request.noRetry) {
                request.retryCount++;
                const { url, retryCount, id } = request;
                // We don't want to see the stack trace in the logs by default, when we are going to retry the request.
                // Thus, we print the full stack trace only when CRAWLEE_VERBOSE_LOG environment variable is set to true.
                const message = this.getMessageFromError(error);
                this.log.warning(`Reclaiming failed request back to the list or queue. ${message}`, {
                    id,
                    url,
                    retryCount,
                });
                await source.reclaimRequest(request, { forefront: request.userData?.__crawlee?.forefront });
                return;
            }
        }
        if (error instanceof SessionError) {
            crawlingContext.session?.retire();
        }
        // If the request is non-retryable, the error and snapshot aren't saved in the errorTrackerRetry object.
        // Therefore, we pass the crawlingContext to the errorTracker.add method, enabling snapshot capture.
        // This is to make sure the error snapshot is not duplicated in the errorTrackerRetry and errorTracker objects.
        const { noRetry, maxRetries } = request;
        if (noRetry || !maxRetries) {
            await this.statistics.errorTracker.addAsync(error, crawlingContext);
        }
        else {
            this.statistics.errorTracker.add(error);
        }
        // If we get here, the request is either not retryable
        // or failed more than retryCount times and will not be retried anymore.
        // Mark the request as failed and do not retry.
        await source.markRequestAsHandled(request);
        this.statistics.failJob(request.id || request.uniqueKey, request.retryCount);
        await this.handleFailedRequestHandler(crawlingContext, error); // This function prints an error message.
    }
    async handleFailedRequestHandler(crawlingContext, error) {
        // Always log the last error regardless if the user provided a failedRequestHandler
        const { id, url, method, uniqueKey } = crawlingContext.request;
        const message = this.getMessageFromError(error, true);
        this.log.error(`Request failed and reached maximum retries. ${message}`, { id, url, method, uniqueKey });
        if (this.failedRequestHandler) {
            await this.failedRequestHandler?.(crawlingContext, // valid cast - ExtendedContext transitively extends CrawlingContext
            error);
        }
    }
    /**
     * Resolves the most verbose error message from a thrown error
     * @param error The error received
     * @returns The message to be logged
     */
    getMessageFromError(error, forceStack = false) {
        if ([TypeError, SyntaxError, ReferenceError].some((type) => error instanceof type)) {
            forceStack = true;
        }
        const stackLines = error?.stack ? error.stack.split('\n') : new Error().stack.split('\n').slice(2);
        const baseDir = process.cwd();
        const userLine = stackLines.find((line) => line.includes(baseDir) && !line.includes('node_modules'));
        if (error instanceof TimeoutError) {
            return process.env.CRAWLEE_VERBOSE_LOG ? error.stack : error.message || error; // stack in timeout errors does not really help
        }
        return process.env.CRAWLEE_VERBOSE_LOG || forceStack
            ? (error.stack ?? [error.message || error, ...stackLines].join('\n'))
            : [error.message || error, userLine].join('\n');
    }
    /**
     * Whether the session should be spared for this error - either because it was already retired, or because the
     * failure says nothing about the session (a rate limit is a property of the domain).
     */
    errorAbsolvesSession(error) {
        return error instanceof SessionError || error instanceof RequestThrottledError;
    }
    canRequestBeRetried(request, error) {
        // Request should never be retried, or the error encountered makes it not able to be retried.
        if (request.noRetry || error instanceof NonRetryableError) {
            return false;
        }
        // User requested retry (we ignore retry count here as its explicitly told by the user to retry)
        if (error instanceof RetryRequestError) {
            return true;
        }
        // Ensure there are more retries available for the request
        const maxRequestRetries = request.maxRetries ?? this.#maxRequestRetries;
        return request.retryCount < maxRequestRetries;
    }
    /**
     * Stops the crawler immediately.
     *
     * This method doesn't wait for currently active requests to finish.
     *
     * To stop the crawler gracefully (waiting for all running requests to finish), use {@apilink BasicCrawler.stop|`crawler.stop()`} instead.
     */
    async teardown() {
        // When this crawler initialized the event manager, its close() call emits
        // the final persistence event after the crawler-specific state has been
        // saved. External event managers still need an explicit event here.
        if (!this.#closeEvents) {
            serviceLocator.getEventManager().emit(EventType.PERSIST_STATE, { isMigrating: false });
        }
        await this.#sessionPoolDep.ifOwned(async (pool) => pool.teardown({ persistState: this.#closeEvents ?? false }));
        if (this.#closeEvents) {
            await serviceLocator.getEventManager().close();
        }
        await this.#autoscaledPool?.abort();
        await this.#concurrencySystemDep?.ifOwned((system) => system.stop());
    }
    getCookieHeaderFromRequest(request) {
        if (request.headers?.Cookie && request.headers?.cookie) {
            this.log.warning(`Encountered mixed casing for the cookie headers for request ${request.url} (${request.id}). Their values will be merged.`);
            return mergeCookies(request.url, [request.headers.cookie, request.headers.Cookie]);
        }
        return request.headers?.Cookie || request.headers?.cookie || '';
    }
    requestMatchesEnqueueStrategy(request) {
        // If `skipNavigation` was used, just return `true`
        try {
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            request.loadedUrl;
        }
        catch (err) {
            if (err instanceof NavigationSkippedError) {
                return true;
            }
            throw err;
        }
        const { url, loadedUrl } = request;
        // eslint-disable-next-line dot-notation -- private access
        const strategy = request['enqueueStrategy'];
        // No strategy set, so we assume it matches, or it was added outside of enqueueLinks
        if (!strategy) {
            return true;
        }
        // If we somehow don't have a loadedUrl, we can't check the strategy anyways, assume it matches
        if (!loadedUrl) {
            return true;
        }
        const baseUrl = new URL(url);
        const loadedBaseUrl = new URL(loadedUrl);
        switch (strategy) {
            case EnqueueStrategy.SameHostname: {
                return baseUrl.hostname === loadedBaseUrl.hostname;
            }
            case EnqueueStrategy.SameDomain: {
                const baseUrlHostname = getDomain(baseUrl.hostname, { mixedInputs: false });
                if (baseUrlHostname) {
                    const loadedBaseUrlHostname = getDomain(loadedBaseUrl.hostname, { mixedInputs: false });
                    return baseUrlHostname === loadedBaseUrlHostname;
                }
                // Can happen for IPs, we just check like same origin
                return baseUrl.origin === loadedBaseUrl.origin;
            }
            case EnqueueStrategy.SameOrigin: {
                // Same as hostname, but also checks protocol
                return baseUrl.origin === loadedBaseUrl.origin;
            }
            case EnqueueStrategy.All:
            default: {
                return baseUrl.protocol === 'http:' || baseUrl.protocol === 'https:';
            }
        }
    }
}
/** The hostname of `url`, falling back to the whole string when it is not parseable - for log messages only. */
function hostnameOrUrl(url) {
    return URL.canParse(url) ? new URL(url).hostname : url;
}
export function createBasicRouter(routes) {
    return Router.create(routes);
}
