export default BasicCrawler;
export type BasicCrawlerOptions = {
    /**
     * User-provided function that performs the logic of the crawler. It is called for each URL to crawl.
     *
     * The function receives the following object as an argument:
     * ```
     * {
     * request: Request,
     * autoscaledPool: AutoscaledPool
     * }
     * ```
     * where the {@link Request} instance represents the URL to crawl.
     *
     * The function must return a promise, which is then awaited by the crawler.
     *
     * If the function throws an exception, the crawler will try to re-crawl the
     * request later, up to `option.maxRequestRetries` times.
     * If all the retries fail, the crawler calls the function
     * provided to the `handleFailedRequestFunction` parameter.
     * To make this work, you should **always**
     * let your function throw exceptions rather than catch them.
     * The exceptions are logged to the request using the
     * {@link Request#pushErrorMessage} function.
     */
    handleRequestFunction: HandleRequest;
    /**
     * Static list of URLs to be processed.
     * Either `requestList` or `requestQueue` option must be provided (or both).
     */
    requestList?: RequestList;
    /**
     * Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
     * Either `requestList` or `requestQueue` option must be provided (or both).
     */
    requestQueue?: RequestQueue;
    /**
     * Timeout in which the function passed as `handleRequestFunction` needs to finish, in seconds.
     */
    handleRequestTimeoutSecs?: number;
    /**
     * A function to handle requests that failed more than `option.maxRequestRetries` times.
     *
     * The function receives the following object as an argument:
     * ```
     * {
     * request: Request,
     * error: Error,
     * }
     * ```
     * where the {@link Request} instance corresponds to the failed request, and the `Error` instance
     * represents the last error thrown during processing of the request.
     *
     * See
     * [source code](https://github.com/apifytech/apify-js/blob/master/src/crawlers/basic_crawler.js#L11)
     * for the default implementation of this function.
     */
    handleFailedRequestFunction?: HandleFailedRequest;
    /**
     * Indicates how many times the request is retried if {@link BasicCrawlerOptions.handleRequestFunction} fails.
     */
    maxRequestRetries?: number;
    /**
     * Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
     * Always set this value in order to prevent infinite loops in misconfigured crawlers.
     * Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
     */
    maxRequestsPerCrawl?: number;
    /**
     * Custom options passed to the underlying {@link AutoscaledPool} constructor.
     * Note that the `runTaskFunction` and `isTaskReadyFunction` options
     * are provided by `BasicCrawler` and cannot be overridden.
     * However, you can provide a custom implementation of `isFinishedFunction`.
     */
    autoscaledPoolOptions?: AutoscaledPoolOptions;
    /**
     * Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
     *
     * *WARNING:* If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash.
     * If you're not sure, just keep the default value and the concurrency will scale up automatically.
     */
    minConcurrency?: number;
    /**
     * Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
     */
    maxConcurrency?: number;
    /**
     * If set to true. Basic crawler will initialize the  {@link SessionPool} with the corresponding `sessionPoolOptions`.
     * The session instance will be than available in the `handleRequestFunction`.
     */
    useSessionPool?: boolean;
    /**
     * The configuration options for {SessionPool} to use.
     */
    sessionPoolOptions?: SessionPoolOptions;
};
export type HandleRequest = (inputs: HandleRequestInputs) => Promise<void>;
export type HandleRequestInputs = {
    /**
     * The original {Request} object.
     */
    request: Request;
    /**
     * A reference to the underlying {@link AutoscaledPool} class that manages the concurrency of the crawler.
     * Note that this property is only initialized after calling the {@link BasicCrawler#run} function.
     * You can use it to change the concurrency settings on the fly,
     * to pause the crawler by calling {@link AutoscaledPool#pause}
     * or to abort it by calling {@link AutoscaledPool#abort}.
     */
    autoscaledPool: AutoscaledPool;
    session?: Session;
};
export type HandleFailedRequest = (inputs: HandleFailedRequestInput) => void | Promise<void>;
export type HandleFailedRequestInput = {
    /**
     * The original {Request} object.
     */
    request: Request;
    /**
     * The Error thrown by `handleRequestFunction`.
     */
    error: Error;
};
/**
 * @typedef BasicCrawlerOptions
 * @property {HandleRequest} handleRequestFunction
 *   User-provided function that performs the logic of the crawler. It is called for each URL to crawl.
 *
 *   The function receives the following object as an argument:
 * ```
 * {
 *   request: Request,
 *   autoscaledPool: AutoscaledPool
 * }
 * ```
 *   where the {@link Request} instance represents the URL to crawl.
 *
 *   The function must return a promise, which is then awaited by the crawler.
 *
 *   If the function throws an exception, the crawler will try to re-crawl the
 *   request later, up to `option.maxRequestRetries` times.
 *   If all the retries fail, the crawler calls the function
 *   provided to the `handleFailedRequestFunction` parameter.
 *   To make this work, you should **always**
 *   let your function throw exceptions rather than catch them.
 *   The exceptions are logged to the request using the
 *   {@link Request#pushErrorMessage} function.
 * @property {RequestList} [requestList]
 *   Static list of URLs to be processed.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @property {RequestQueue} [requestQueue]
 *   Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.
 *   Either `requestList` or `requestQueue` option must be provided (or both).
 * @property {number} [handleRequestTimeoutSecs=60]
 *   Timeout in which the function passed as `handleRequestFunction` needs to finish, in seconds.
 * @property {HandleFailedRequest} [handleFailedRequestFunction]
 *   A function to handle requests that failed more than `option.maxRequestRetries` times.
 *
 *   The function receives the following object as an argument:
 * ```
 * {
 *   request: Request,
 *   error: Error,
 * }
 * ```
 *   where the {@link Request} instance corresponds to the failed request, and the `Error` instance
 *   represents the last error thrown during processing of the request.
 *
 *   See
 *   [source code](https://github.com/apifytech/apify-js/blob/master/src/crawlers/basic_crawler.js#L11)
 *   for the default implementation of this function.
 * @property {number} [maxRequestRetries=3]
 *   Indicates how many times the request is retried if {@link BasicCrawlerOptions.handleRequestFunction} fails.
 * @property {number} [maxRequestsPerCrawl]
 *   Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.
 *   Always set this value in order to prevent infinite loops in misconfigured crawlers.
 *   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.
 * @property {AutoscaledPoolOptions} [autoscaledPoolOptions]
 *   Custom options passed to the underlying {@link AutoscaledPool} constructor.
 *   Note that the `runTaskFunction` and `isTaskReadyFunction` options
 *   are provided by `BasicCrawler` and cannot be overridden.
 *   However, you can provide a custom implementation of `isFinishedFunction`.
 * @property {number} [minConcurrency=1]
 *   Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 *
 *   *WARNING:* If you set this value too high with respect to the available system memory and CPU, your crawler will run extremely slow or crash.
 *   If you're not sure, just keep the default value and the concurrency will scale up automatically.
 * @property {number} [maxConcurrency=1000]
 *   Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding {@link AutoscaledPool} option.
 * @property {boolean} [useSessionPool=false]
 *   If set to true. Basic crawler will initialize the  {@link SessionPool} with the corresponding `sessionPoolOptions`.
 *   The session instance will be than available in the `handleRequestFunction`.
 * @property {SessionPoolOptions} [sessionPoolOptions] The configuration options for {SessionPool} to use.
 */
/**
 * Provides a simple framework for parallel crawling of web pages.
 * The URLs to crawl are fed either from a static list of URLs
 * or from a dynamic queue of URLs enabling recursive crawling of websites.
 *
 * `BasicCrawler` is a low-level tool that requires the user to implement the page
 * download and data extraction functionality themselves.
 * If you want a crawler that already facilitates this functionality,
 * please consider using {@link PuppeteerCrawler} or {@link CheerioCrawler}.
 *
 * `BasicCrawler` invokes the user-provided {@link BasicCrawlerOptions.handleRequestFunction}
 * for each {@link Request} object, which represents a single URL to crawl.
 * The {@link Request} objects are fed from the {@link RequestList} or the {@link RequestQueue}
 * instances provided by the {@link BasicCrawlerOptions.requestList} or {@link BasicCrawlerOptions.requestQueue}
 * constructor options, respectively.
 *
 * If both {@link BasicCrawlerOptions.requestList} and {@link BasicCrawlerOptions.requestQueue} options are used,
 * the instance first processes URLs from the {@link RequestList} and automatically enqueues all of them
 * to {@link RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes if there are no more {@link Request} objects to crawl.
 *
 * New requests are only dispatched when there is enough free CPU and memory available,
 * using the functionality provided by the {@link AutoscaledPool} class.
 * All {@link AutoscaledPool} configuration options can be passed to the `autoscaledPoolOptions`
 * parameter of the `BasicCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency`
 * {@link AutoscaledPool} options are available directly in the `BasicCrawler` constructor.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Prepare a list of URLs to crawl
 * const requestList = new Apify.RequestList({
 *   sources: [
 *       { url: 'http://www.example.com/page-1' },
 *       { url: 'http://www.example.com/page-2' },
 *   ],
 * });
 * await requestList.initialize();
 *
 * // Crawl the URLs
 * const crawler = new Apify.BasicCrawler({
 *     requestList,
 *     handleRequestFunction: async ({ request }) => {
 *         // 'request' contains an instance of the Request class
 *         // Here we simply fetch the HTML of the page and store it to a dataset
 *         const { body } = await Apify.utils.requestAsBrowser(request);
 *         await Apify.pushData({
 *             url: request.url,
 *             html: body,
 *         })
 *     },
 * });
 *
 * await crawler.run();
 * ```
 *
 * @property {AutoscaledPool} autoscaledPool
 *  A reference to the underlying {@link AutoscaledPool} class that manages the concurrency of the crawler.
 *  Note that this property is only initialized after calling the {@link BasicCrawler#run} function.
 *  You can use it to change the concurrency settings on the fly,
 *  to pause the crawler by calling {@link AutoscaledPool#pause}
 *  or to abort it by calling {@link AutoscaledPool#abort}.
 */
declare class BasicCrawler {
    /**
     * @param {BasicCrawlerOptions} options
     * All `BasicCrawler` parameters are passed via an options object.
     */
    constructor(options: BasicCrawlerOptions);
    requestList: any;
    requestQueue: any;
    handleRequestFunction: any;
    handleRequestTimeoutMillis: number;
    handleFailedRequestFunction: any;
    maxRequestRetries: any;
    handledRequestsCount: number;
    stats: Statistics;
    sessionPoolOptions: any;
    useSessionPool: any;
    autoscaledPoolOptions: any;
    isRunningPromise: Promise<void> | null;
    /**
     * Runs the crawler. Returns a promise that gets resolved once all the requests are processed.
     *
     * @return {Promise<void>}
     */
    run(): Promise<void>;
    autoscaledPool: AutoscaledPool | undefined;
    sessionPool: import("../session_pool/session_pool").SessionPool | undefined;
    _pauseOnMigration(): Promise<void>;
    /**
     * Fetches request from either RequestList or RequestQueue. If request comes from a RequestList
     * and RequestQueue is present then enqueues it to the queue first.
     *
     * @ignore
     */
    _fetchNextRequest(): Promise<any>;
    /**
     * Wrapper around handleRequestFunction that fetches requests from RequestList/RequestQueue
     * then retries them in a case of an error, etc.
     *
     * @ignore
     */
    _runTaskFunction(): Promise<void>;
    /**
     * Returns true if either RequestList or RequestQueue have a request ready for processing.
     *
     * @ignore
     */
    _isTaskReadyFunction(): Promise<boolean>;
    /**
     * Returns true if both RequestList and RequestQueue have all requests finished.
     *
     * @ignore
     */
    _defaultIsFinishedFunction(): Promise<any>;
    /**
     * Handles errors thrown by user provided handleRequestFunction()
     * @param {Error} error
     * @param {Request} request
     * @param {(RequestList|RequestQueue)} source
     * @return {Promise<boolean|void|QueueOperationInfo>} willBeRetried
     * @ignore
     */
    _requestFunctionErrorHandler(error: Error, request: Request, source: RequestList | RequestQueue): Promise<boolean | void | QueueOperationInfo>;
    /**
     * Updates handledRequestsCount from possibly stored counts,
     * usually after worker migration. Since one of the stores
     * needs to have priority when both are present,
     * it is the request queue, because generally, the request
     * list will first be dumped into the queue and then left
     * empty.
     *
     * @return {Promise<void>}
     * @ignore
     */
    _loadHandledRequestCount(): Promise<void>;
}
import { RequestList } from "../request_list";
import { RequestQueue } from "../request_queue";
import { AutoscaledPoolOptions } from "../autoscaling/autoscaled_pool";
import { SessionPoolOptions } from "../session_pool/session_pool";
import Request from "../request";
import AutoscaledPool from "../autoscaling/autoscaled_pool";
import { Session } from "../session_pool/session";
import Statistics from "./statistics";
import { QueueOperationInfo } from "../request_queue";
