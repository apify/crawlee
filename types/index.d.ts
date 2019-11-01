declare module 'apify' {
    import { IncomingMessage } from 'http'
    import { EventEmitter } from 'events'
    import {
        Page,
        Response as PuppeteerResponse,
        ResourceType,
        LaunchOptions,
        HttpMethod,
        Request as PuppeteerRequest,
        CDPSession,
        PageFnOptions,
        Browser,
        DirectNavigationOptions,
    } from 'puppeteer'

    export interface ForceCloud {
        /**
         * If set to true then the function uses cloud storage usage even
         * if the APIFY_LOCAL_STORAGE_DIR environment variable is set. This way it
         * is possible to combine local and cloud storage.
         */
        forceCloud: boolean
    }

    export interface ContentType {
        /**
         * Specifies a custom MIME content type of the record.
         */
        contentType: string
    }

    export interface Env {
        /**
         * ID of the actor (APIFY_ACTOR_ID)
         */
        actorId: string
        /**
         * ID of the actor run (APIFY_ACTOR_RUN_ID)
         */
        actorRunId: string
        /**
         * ID of the actor task (APIFY_ACTOR_TASK_ID)
         */
        actorTaskId: string
        /**
         * ID of the user who started the actor - note that it might
         * be different than the owner of the actor (APIFY_USER_ID)
         */
        userId: string
        /**
         * Authentication token representing privileges given to the actor run,
         * it can be passed to various Apify APIs (APIFY_TOKEN).
         */
        token: string
        /**
         * Date when the actor was started (APIFY_STARTED_AT)
         */
        startedAt: Date
        /**
         * Date when the actor will time out (APIFY_TIMEOUT_AT)
         */
        timeoutAt: Date
        /**
         * ID of the key-value store where input and output data of this
         * actor is stored (APIFY_DEFAULT_KEY_VALUE_STORE_ID)
         */
        defaultKeyValueStoreId: string
        /**
         * ID of the dataset where input and output data of this actor is
         * stored (APIFY_DEFAULT_DATASET_ID)
         */
        defaultDatasetId: string
        /**
         * Amount of memory allocated for the actor,in megabytes (APIFY_MEMORY_MBYTES)
         */
        memoryMbytes: number
    }

    type Nullable<T> = {
        [P in keyof T]: T[P] | null;
    }

    export const main: (callback: () => Promise<any>) => unknown
    export const getEnv: <T = unknown>() => Nullable<Env & T>
    export const call: <T = any>(funcName: string, data: any) => Promise<T>
    export const callTask: () => unknown
    export const getMemoryInfo: () => unknown
    export const getApifyProxyUrl: () => unknown
    export const isAtHome: () => unknown
    export const getInput: <T>() => Promise<T>
    export const client: () => unknown

    export class AutoscaledPool {
        minConcurrency: number
        maxConcurrency: number
        desiredConcurrency: number
        currentConcurrency: number
        run(): Promise<void>
        abort(): Promise<void>
        pause(timeoutSecs?: number): Promise<void>
        resume(): void
    }
    export class BasicCrawler { }
    export class CheerioCrawler { }
    export type InnerId = string
    export type DataSetTypes = Buffer | string | { [index: string]: any }
    export interface DataSetData<T extends DataSetTypes> {
        items: T
        total: number
        limit: number
        offset: number
    }
    export interface DataSetInfo {
        id: InnerId
        name: string
        userId: string
        createdAt: Date
        modifiedAt: Date
        accessedAt: Date
        itemCount: number
        cleanItemCount: number
    }
    export interface DataSetIteratorOptions {
        /** Number of array elements that should be skipped at the start. */
        offset?: number
        /** If true then the objects are sorted by createdAt in descending order. */
        desc?: boolean
        /** If provided then returned objects will only contain specified keys. */
        fields?: string[]
        /** If provided then objects will be unwound based on provided field. */
        unwind?: string
        /** How many items to load in one request. */
        limit?: number
    }
    export interface DataSetGetDataOptions {
        /** Format of the items property, possible values are: json, csv, xlsx, html, xml and rss. */
        format?: 'json' | 'csv' | 'xlsx' | 'html' | 'xml' | 'rss'
        /** number of array elements that should be skipped at the start. */
        offset?: number
        /** Maximum number of array elements to return. */
        limit?: number
        /** If true then the objects are sorted by createdAt in descending order. Otherwise they are sorted in ascending order. */
        desc?: boolean
        /** An array of field names that will be included in the result. If omitted, all fields are included in the results. */
        fields?: string[]
        /** Specifies a name of the field in the result objects that will be used to unwind the resulting objects. By default, the results are returned as they are. */
        unwind?: string
        /** If true then response from API will not be parsed. */
        disableBodyParser?: boolean
        /** If true then the response will define the Content-Disposition: attachment HTTP header, forcing a web browser to download the file rather than to display it. By default, this header is not present. */
        attachment?: boolean
        /** A delimiter character for CSV files, only used if format is csv. */
        delimiter?: string
        /** All responses are encoded in UTF-8 encoding. By default, the CSV files are prefixed with the UTF-8 Byte Order Mark (BOM), while JSON, JSONL, XML, HTML and RSS files are not. If you want to override this default behavior, set bom option to true to include the BOM, or set bom to false to skip it. */
        bom?: boolean
        /** Overrides the default root element name of the XML output. By default, the root element is results. */
        xmlRoot?: string
        /** Overrides the default element name that wraps each page or page function result object in XML output. By default, the element name is page or result, depending on the value of the simplified option. */
        xmlRow?: string
        /** If set to true then header row in CSV format is skipped. */
        skipHeaderRow?: boolean
        /** If set to true then function applies the fields: ['url','pageFunctionResult','errorInfo'] and unwind: 'pageFunctionResult' options. */
        simplified?: boolean
        /** If set to true then all the items with errorInfo property will be skipped from the output. */
        skipFailedPages?: boolean
    }
    export class DataSet<T extends DataSetTypes> {
        pushData(data: T | Array<T>): Promise<void>
        getData(options?: DataSetGetDataOptions): Promise<DataSetData<T>>
        getInfo(): Promise<DataSetInfo>
        forEach(iteratee: (item: T, index: number) => void, options?: DataSetIteratorOptions, index?: number): Promise<void>
        map<U = unknown>(iteratee: (item: T, index: number) => U, options?: DataSetIteratorOptions): Promise<U[]>
        reduce<U = unknown>(iteratee: (memo: U, value: T, index: number) => U, memo: U, options?: DataSetIteratorOptions): Promise<U>
        drop(): Promise<void>
    }

    export class KeyValueStore {
        constructor(storeId: InnerId, storeName: string)
        getValue<T = unknown>(key: string): Promise<T | null>
        setValue<T extends Object | string | Buffer>(
            key: string,
            value: T | null,
            options?: ContentType
        ): Promise<void>
        drop(): Promise<void>
        getPublicUrl(key: string): string
        forEachKey(
            iteratee: (key: string, index: number, obj: { size: number }) => void,
            options?: { exclusiveStartKey: string }
        ): Promise<void>
    }

    export class Events extends EventEmitter {
        on<L extends (info: { isCpuOverloaded: boolean }) => void>(eventName: 'cpuInfo', listener: L): this
        on(eventName: 'migrating', listener: (...args: any[]) => void): this
        on<L extends (state: { isMigrating: boolean }) => void>(eventName: 'persistState', listener: L): this
    }

    export const pushData: <T = unknown>(value: T) => Promise<void>
    export const openDataset: <T extends DataSetTypes = any>(
        storeIdOrName?: InnerId,
        options?: ForceCloud
    ) => Promise<DataSet<T>>
    export const metamorph: (targetActorId: InnerId, input?: Object | String | Buffer, options?: ContentType & {
        build?: string
    }) => Promise<void>
    export const openRequestList: <T>(listName: string | null, sources: RequestListOptions['sources']) => Promise<RequestList<T>>
    export const events: Events
    export const initializeEvents: () => any
    export const stopEvents: () => any
    export const getValue: KeyValueStore['getValue']
    export const setValue: KeyValueStore['setValue']
    export const openKeyValueStore: (storeIdOrName?: InnerId, options?: ForceCloud) => Promise<KeyValueStore>
    export const launchPuppeteer: () => any

    export interface StealthOptions {
        /**
         * If plugins should be added to the navigator.
         */
        addPlugins?: boolean
        /**
         * Emulates window Iframe.
         */
        emulateWindowFrame?: boolean
        /**
         * Emulates graphic card.
         */
        emulateWebGL?: boolean
        /**
         * Emulates console.debug to return null.
         */
        emulateConsoleDebug?: boolean
        /**
         * Adds languages to the navigator.
         */
        addLanguage?: boolean
        /**
         * Hides the webdriver by changing the navigator proto.
         */
        hideWebDriver?: boolean
        /**
         * Fakes interaction with permissions.
         */
        hackPermissions?: boolean
        /**
         * Adds the chrome runtime properties.
         */
        mockChrome?: boolean
        /**
         * Adds the chrome runtime properties inside the every newly created iframe.
         */
        mockChromeInIframe?: boolean
        /**
         * Sets device memory to other value than 0.
         */
        mockDeviceMemory?: boolean
    }

    export interface LaunchPuppeteerOptions extends LaunchOptions {
        /**
         * URL to a HTTP proxy server. It must define the port number, and it may also contain proxy username and password.
         * Example: http://bob:pass123@proxy.example.com:1234.
         */
        proxyUrl?: string
        /**
         * The User-Agent HTTP header used by the browser. If not provided, the function sets User-Agent to a reasonable default to reduce the chance of detection of the crawler.
         */
        userAgent?: string
        /**
         * If true and executablePath is not set, Puppeteer will launch full Google Chrome browser available on the machine rather than the bundled Chromium. The path to Chrome executable is taken from the APIFY_CHROME_EXECUTABLE_PATH environment variable if provided, or defaults to the typical Google Chrome executable location specific for the operating system. By default, this option is false.
         */
        useChrome?: boolean
        /**
         * If set to true, Puppeteer will be configured to use Apify Proxy for all connections. For more information, see the documentation
         */
        useApifyProxy?: boolean
        /**
         * An array of proxy groups to be used by the Apify Proxy. Only applied if the useApifyProxy option is true.
         */
        apifyProxyGroups?: string
        /**
         * Apify Proxy session identifier to be used by all the Chrome browsers. All HTTP requests going through the proxy with the same session identifier will use the same target proxy server (i.e. the same IP address). The identifier can only contain the following characters: 0-9, a-z, A-Z, ".", "_" and "~". Only applied if the useApifyProxy option is true.
         */
        apifyProxySession?: string
        /**
         * Either a require path (string) to a package to be used instead of default puppeteer, or an already required module (Object). This enables usage of various Puppeteer wrappers such as puppeteer-extra.
         * Take caution, because it can cause all kinds of unexpected errors and weird behavior. Apify SDK is not tested with any other library besides puppeteer itself.
         */
        puppeteerModule?: any
        /**
         * This setting hides most of the known properties that identify headless Chrome and makes
         * it nearly undetectable. It is recommended to use it together with the useChrome set to true.
         */
        stealth?: boolean
        /**
         * Using this configuration, you can disable some of the hiding tricks. For these settings to take effect stealth must be set to true
         */
        stealthOptions?: StealthOptions
    }
    export interface PuppeteerPoolOptions {
        /**
         * Enables the use of a preconfigured LiveViewServer that serves snapshots just before a page would be recycled by PuppeteerPool. If there are no clients connected, it has close to zero impact on performance.
         */
        useLiveView?: boolean
        /**
         * Maximum number of open pages (i.e. tabs) per browser. When this limit is reached, new pages are loaded in a new browser instance.
         */
        maxOpenPagesPerInstance?: number
        /**
         * Maximum number of requests that can be processed by a single browser instance. After the limit is reached, the browser is retired and new requests are handled by a new browser instance.
         */
        retireInstanceAfterRequestCount?: number
        /**
         * All browser management operations such as launching a new browser, opening a new page or closing a page will timeout after the set number of seconds and the connected browser will be retired.
         */
        puppeteerOperationTimeoutSecs?: number
        /**
         * Indicates how often are the open Puppeteer instances checked whether they can be closed.
         */
        instanceKillerIntervalSecs?: number
        /**
         * When Puppeteer instance reaches the options.retireInstanceAfterRequestCount limit then it is considered retired and no more tabs will be opened. After the last tab is closed the whole browser is closed too. This parameter defines a time limit between the last tab was opened and before the browser is closed even if there are pending open tabs.
         */
        killInstanceAfterSecs?: number
        /**
         * Overrides the default function to launch a new Puppeteer instance. The function must return a promise resolving to Browser instance. See the source code on GitHub for the default implementation.
         */
        launchPuppeteerFunction?: LaunchPuppeteerFunction
        /**
         * Options used by Apify.launchPuppeteer() to start new Puppeteer instances. See LaunchPuppeteerOptions.
         */
        launchPuppeteerOptions?: LaunchPuppeteerOptions
        /**
         * Enables recycling of disk cache directories by Chrome instances. When a browser instance is closed, its disk cache directory is not deleted but it's used by a newly opened browser instance. This is useful to reduce amount of data that needs to be downloaded to speed up crawling and reduce proxy usage. Note that the new browser starts with empty cookies, local storage etc. so this setting doesn't affect anonymity of your crawler.    Beware that the disk cache directories can consume a lot of disk space. To limit the space consumed, you can pass the --disk-cache-size=X argument to options.launchPuppeteerOptions.args, where X is the approximate maximum number of bytes for disk cache.
         * Do not use the options.recycleDiskCache setting together with --disk-cache-dir argument in options.launchPuppeteerOptions.args, the behavior is undefined.
         */
        recycleDiskCache?: boolean
        /**
         * An array of custom proxy URLs to be used by the PuppeteerPool instance. The provided custom proxies' order will be randomized and the resulting list rotated. Custom proxies are not compatible with Apify Proxy and an attempt to use both configuration options will cause an error to be thrown on startup.
         */
        proxyUrls?: string[]
    }

    export class PuppeteerPool {
        constructor(optiosn: PuppeteerPoolOptions)
        serveLiveViewSnapshot(page: Page): Promise<void>
        recyclePage(page: Page): Promise<void>
        retire(browser: Browser): Promise<void>
        destroy(): Promise<void>
        newPage(): Promise<Page>
    }

    export type HandlePageFunctionObj<UserData> = {
        request: Request<UserData>
        response: PuppeteerResponse
        page: Page & {
            _client: CDPSession
        }
        puppeteerPool: PuppeteerPool
        autoscaledPool: AutoscaledPool
    }

    export type HandlePageFunctionCallback<UserData> = (obj: HandlePageFunctionObj<UserData>) => Promise<any> | void
    export type GotoFunction<UserData> = (obj: HandlePageFunctionObj<UserData>) => ReturnType<Page['goto']>
    export type LaunchPuppeteerFunction = () => any

    export type PuppeteerCrawlerOptions<UserData> = {
        handlePageFunction: HandlePageFunctionCallback<UserData>
        requestQueue?: RequestQueue<UserData>
        requestList?: RequestList<UserData>
        handlePageTimeoutSecs?: number
        gotoFunction?: GotoFunction<UserData>
        handleFailedRequestFunction?: HandlePageFunctionCallback<UserData>
        maxRequestRetries?: number
        maxRequestsPerCrawl?: number
        maxOpenPagesPerInstance?: number
        retireInstanceAfterRequestCount?: number
        instanceKillerIntervalMillis?: number
        killInstanceAfterMillis?: number
        proxyUrls?: string[]
        launchPuppeteerFunction?: LaunchPuppeteerFunction
        launchPuppeteerOptions?: LaunchOptions
        autoscaledPoolOptions?: any
        minConcurrency?: number
        maxConcurrency?: number
    }

    export interface QueueOperationInfo {
        /**
         * Indicates if request was already present in the queue.
         */
        wasAlreadyPresent?: boolean
        /**
         * Indicates if request was already marked as handled.
         */
        wasAlreadyHandled?: boolean
        /**
         *  ID of the added request
         */
        requestId?: string
        /**
         * The original Request object passed to the RequestQueue function.
         */
        request: Request
    }

    export class PuppeteerCrawler<UserData> {
        constructor(options: PuppeteerCrawlerOptions<UserData>)
        run(): Promise<void>
    }
    export class PseudoUrl<UserData = {}> { }

    export interface RequestOptions<UserData> {
        url: string
        uniqueKey?: string
        method?: HttpMethod
        payload?: string | Buffer
        headers?: {
            [index: string]: string | number
        }
        userData: UserData
        keepUrlFragment?: boolean
        useExtendedUniqueKey?: boolean
    }

    export class Request<T = any> {
        /**
         * Request ID
         */
        id: string
        /**
         * URL of the web page to crawl.
         */
        url: string
        loadedUrl: string
        /**
         * A unique key identifying the request. Two requests with the same uniqueKey are considered as pointing to the same URL.
         **/
        uniqueKey: string
        /**
         * HTTP method, e.g. GET or POST.
         */
        method: HttpMethod
        /**
         * HTTP request payload, e.g. for POST requests.
         */
        payload: string
        /**
         * Indicates whether the request will be automatically retried or not.
         */
        noRetry: boolean
        /**
         * Indicates the number of times the crawling of the request has been retried on error.
         */
        retryCount: number
        /**
         * An array of error messages from request processing.
         */
        errorMessages: string[]
        /**
         * Object with HTTP headers. Key is header name, value is the value.
         */
        headers: object
        /**
         * Custom user data assigned to the request.
         */
        userData: T
        /**
         * Indicates the time when the request has been processed. Is null if the request has not been crawled yet.
         */
        handledAt: Date
        constructor(options: RequestOptions<T>)
        pushErrorMessage(err: Error | string, options?: { omitStack?: boolean }): void
    }

    export interface RequestListOptions {
        /**
         * An array of sources of URLs for the RequestList. It can be either an array of plain objects that define the url property, or an array of instances of the Request class. Additionally, the requestsFromUrl property may be used instead of url, which will instruct RequestList to download the source URLs from a given remote location. The URLs will be parsed from the received response.
         */
        sources: Array<Request | {
            method: HttpMethod
            url?: string
            requestsFromUrl?: string
        }>
        /**
         * Identifies the key in the default key-value store under which the RequestList persists its current state. State represents a position of the last scraped request in the list. If this is set then RequestListpersists the state in regular intervals to key value store and loads the state from there in case it is restarted due to an error or system reboot.
         */
        persistStateKey?: string
        /**
         * Identifies the key in the default key-value store under which the RequestList persists its initial sources. If this is set then RequestListpersists all of its sources to key value store at initialization and loads them from there in case it is restarted due to an error or system reboot.
         */
        persistSourcesKey?: string
        /**
         * The state object that the RequestList will be initialized from. It is in the form as returned by RequestList.getState(), such as follows:
         * Note that the preferred (and simpler) way to persist the state of crawling of the RequestList is to use the stateKeyPrefix parameter instead.
         */
        state?: {
            nextIndex: number
            nextUniqueKey: string
            inProgress: {
                [index: string]: boolean
            }
        }
        /**
         * By default, RequestList will deduplicate the provided URLs. Default deduplication is based on the uniqueKey property of passed source Request objects.
         * If the property is not present, it is generated by normalizing the URL. If present, it is kept intact. In any case, only one request per uniqueKey is added to the RequestList resulting in removal of duplicate URLs / unique keys.
         * Setting keepDuplicateUrls to true will append an additional identifier to the uniqueKey of each request that does not already include a uniqueKey. Therefore, duplicate URLs will be kept in the list. It does not protect the user from having duplicates in user set uniqueKeys however. It is the user's responsibility to ensure uniqueness of their unique keys if they wish to keep more than just a single copy in the RequestList.
         */
        keepDuplicateUrls?: boolean
    }
    export class RequestList<T> {
        constructor(options: RequestListOptions)
        initialize(): Promise<void>
        persistState(): Promise<void>
        getState(): any
        isEmpty(): Promise<boolean>
        isFinished(): Promise<boolean>
        fetchNextRequest<T>(): Promise<Request<T>>
        markRequestHandled<T>(request: Request<T>): Promise<void>
        reclaimRequest<T>(request: Request<T>): Promise<void>
        length(): number
        handledCount(): number
    }
    export interface RequestQueueOptions {
        forefront?: boolean
    }
    export interface AddRequestObject {

    }
    export class RequestQueue<T> {
        addRequest(request: Partial<Request<T>>, options?: RequestQueueOptions): Promise<QueueOperationInfo>
        getRequest(requestId: string): Promise<Request<T>>
        fetchNextRequest(): Promise<Request>
        markRequestHandled(request: Request): Promise<QueueOperationInfo>
        reclaimRequest(request: Request, options?: RequestQueueOptions): Promise<QueueOperationInfo>
        isEmpty(): Promise<boolean>
        isFinished(): Promise<boolean>
        delete(): Promise<void>
        handledCount(): Promise<number>
    }
    export const openRequestQueue: <T>(queueIdOrName?: InnerId, options?: ForceCloud) => Promise<RequestQueue<T>>
    export class SettingsRotator { }
    export const browse: () => unknown
    export const launchWebDriver: () => unknown
    export type RequestHandler = (request: PuppeteerRequest) => Promise<void>
    export interface EnqueueLinksOptions {
        /**
         * Puppeteer Page object.
         */
        page: Page
        /**
         * A request queue to which the URLs will be enqueued.
         */
        requestQueue: RequestQueue<any>
        /**
         * A CSS selector matching elements to be clicked on. Unlike in enqueueLinks(), there is no default value. This is to prevent suboptimal use of this function by using it too broadly.
         */
        selector: string
        /**
         * An array of PseudoUrls matching the URLs to be enqueued, or an array of strings or RegExps or plain Objects from which the PseudoUrls can be constructed.
         * The plain objects must include at least the purl property, which holds the pseudo-URL string or RegExp. All remaining keys will be used as the requestTemplate argument of the PseudoUrl constructor, which lets you specify special properties for the enqueued Request objects.
         * If pseudoUrls is an empty array, null or undefined, then the function enqueues all links found on the page.
         */
        pseudoUrls?: Array<string | RegExp | PseudoUrl>
        /**
         * Just before a new Request is constructed and enqueued to the RequestQueue, this function can be used to remove it or modify its contents such as userData, payload or, most importantly uniqueKey. This is useful when you need to enqueue multiple Requests to the queue that share the same URL, but differ in methods or payloads, or to dynamically update or create userData.
         * For example: by adding useExtendedUniqueKey: true to the request object, uniqueKey will be computed from a combination of url, method and payload which enables crawling of websites that navigate using form submits (POST requests).
         *
         * @example
         * ```
         * function transformRequestFunction(request) {
         *   request.userData.foo = 'bar';
         *   request.useExtendedUniqueKey = true;
         *   return request;
         * }
         * ```
         */
        transformRequestFunction?: (request: PuppeteerRequest) => PuppeteerRequest

        /**
         * Clicking in the page triggers various asynchronous operations that lead to new URLs being shown by the browser. It could be a simple JavaScript redirect or opening of a new tab in the browser. These events often happen only some time after the actual click. Requests typically take milliseconds while new tabs open in hundreds of milliseconds.
         * To be able to capture all those events, the enqueueLinksByClickingElements() function repeatedly waits for the waitForPageIdleSecs. By repeatedly we mean that whenever a relevant event is triggered, the timer is restarted. As long as new events keep coming, the function will not return, unless the below maxWaitForPageIdleSecs timeout is reached.You may want to reduce this for example when you're sure that your clicks do not open new tabs, or increase when you're not getting all the expected URLs.
         */
        waitForPageIdleSecs?: number

        /**
         * This is the maximum period for which the function will keep tracking events, even if more events
         * keep coming. Its purpose is to prevent a deadlock in the page by periodic events, often unrelated
         * to the clicking itself. See waitForPageIdleSecs above for an explanation.
         */
        maxWaitForPageIdleSecs: number
    }
    export interface BlockRequestsOptions {
        /**
         * The patterns of URLs to block from being loaded by the browser. Only * can be used as a
         * wildcard. It is also automatically added to the beginning and end of the pattern. This
         * limitation is enforced by the DevTools protocol. .png is the same as *.png*.
         */
        urlPatterns?: string[]
        /**
         * If you just want to append to the default blocked patterns, use this property.
         */
        extraUrlPatterns?: boolean
        /**
         * @deprecated
         */
        includeDefaults?: boolean
    }

    export const utils: {
        URL_NO_COMMAS_REGEX: RegExp
        URL_WITH_COMMAS_REGEX: RegExp
        isDocker(): Promise<boolean>
        createRequestDebugInfo(request: Request): any
        sleep(millis: number): Promise<void>
        downloadListOfUrls(options: { url: string, encoding?: string, urlRegExp?: RegExp }): Promise<Array<string>>
        extractUrls(string: string, urlRegExp?: RegExp): Array<string>
        getRandomUserAgent(): string
        htmlToText(html: string): string
        requestAsBrowser(options: {
            /** URL of the target endpoint. Supports both HTTP and HTTPS schemes. */
            url: string
            /** HTTP method */
            method?: HttpMethod
            /**
             * Additional HTTP headers to add. It's only recommended to use this option,
             * with headers that are typically added by websites, such as cookies. Overriding
             * default browser headers will remove the masking this function provides.
             **/
            headers?: { [index: string]: string }
            /**
             * Two-letter ISO 639 language code.
             */
            languageCode?: string
            /**
             * Two-letter ISO 3166 country code.
             */
            countryCode?: string
            /**
             * If `true`, the function uses User-Agent of a mobile browser.
             */
            isMobile?: boolean
            /**
             * Function accepts `response` object as a single parameter and should return true or false.
             * If function returns true request gets aborted. This function is passed to the
             * (@apify/http-request)[https://www.npmjs.com/package/@apify/http-request] NPM package.
             */
            abortFunction?: (response: Response) => boolean
        }): IncomingMessage

        /**
         * The log instance enables level aware logging of messages and we advise
         * to use it instead of `console.log()` and its aliases in most development
         * scenarios.
         *
         * A very useful use case for `log` is using `log.debug` liberally throughout
         * the codebase to get useful logging messages only when appropriate log level is set
         * and keeping the console tidy in production environments.
         *
         * The available logging levels are, in this order: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `OFF`
         * and can be referenced from the `log.LEVELS` constant, such as `log.LEVELS.ERROR`.
         *
         * To log messages to the system console, use the `log.level(message)` invocation,
         * such as `log.debug('this is a debug message')`.
         *
         * To prevent writing of messages above a certain log level to the console, simply
         * set the appropriate level. The default log level is `INFO`, which means that
         * `DEBUG` messages will not be printed, unless enabled.
         *
         * @example
         *
         * ```
         *   const Apify = require('apify')
         *   const { log } = Apify.utils
         *
         *   log.info('Information message', { someData: 123 }); // prints message
         *   log.debug('Debug message', { debugData: 'hello' }); // doesn't print anything
         *
         *   log.setLevel(log.LEVELS.DEBUG)
         *   log.debug('Debug message'); // prints message
         *
         *   log.setLevel(log.LEVELS.ERROR)
         *   log.debug('Debug message'); // doesn't print anything
         *   log.info('Info message'); // doesn't print anything
         *
         *   log.error('Error message', { errorDetails: 'This is bad!' }); // prints message
         *   try {
         *     throw new Error('Not good!')
         *   } catch (e) {
         *     log.exception(e, 'Exception occurred', { errorDetails: 'This is really bad!' }); // prints message
         *   }
         * ```
         *
         * Another very useful way of setting the log level is by setting the `APIFY_LOG_LEVEL`
         * environment variable, such as `APIFY_LOG_LEVEL=DEBUG`. This way, no code changes
         * are necessary to turn on your debug messages and start debugging right away.
         */
        log: {
            /**
             * Map of available log levels that's useful for easy setting of appropriate log levels.
             * Each log level is represented internally by a number. Eg. `log.LEVELS.DEBUG === 5`.
             */
            LEVELS: {
                DEBUG: number
            }
            /**
             * Sets the log level to the given value, preventing messages from less important log levels
             * from being printed to the console. Use in conjunction with the `log.LEVELS` constants such as
             *
             * ```
             * log.setLevel(log.LEVELS.DEBUG)
             * ```
             *
             * Default log level is INFO.
             */
            setLevel: (level: number) => void
            /**
             * Returns the currently selected logging level. This is useful for checking whether a message
             * will actually be printed to the console before one actually performs a resource intensive operation
             * to construct the message, such as querying a DB for some metadata that need to be added. If the log
             * level is not high enough at the moment, it doesn't make sense to execute the query.
             */
            getLevel(): number
            /**
             * Logs a `DEBUG` message. By default, it will not be written to the console. To see `DEBUG`
             * messages in the console, set the log level to `DEBUG` either using the `log.setLevel(log.LEVELS.DEBUG)`
             * method or using the environment variable `APIFY_LOG_LEVEL=DEBUG`. Data are stringified and appended
             * to the message.
             */
            debug(message: string, data?: any): void
            /**
             * Logs an `INFO` message. `INFO` is the default log level so info messages will be always logged,
             * unless the log level is changed. Data are stringified and appended to the message.
             */
            info(message: string, data?: any): void
            /**
             * Logs a `WARNING` level message. Data are stringified and appended to the message.
             */
            warning(message: string, data?: any): void
            /**
             * Logs an `ERROR` message. Use this method to log error messages that are not directly connected
             * to an exception. For logging exceptions, use the `log.exception` method.
             */
            error(message: string, data?: any): void
            /**
             * Logs an `ERROR` level message with a nicely formatted exception. Note that the exception is the first parameter
             * here and an additional message is only optional.
             */
            exception(exception: Error, message?: string, data?: any): void
        }

        puppeteer: {
            hideWebDriver(page: Page): Promise<void>
            gotoExtended<T = unknown>(page: Page, Request: Request<T>, options: DirectNavigationOptions): Promise<PuppeteerResponse>
            infiniteScroll(page: Page, options?: {
                timeoutSecs?: number
                waitForSecs?: number
            }): Promise<void>
            injectFile(page: Page, filePath: string, options?: {
                surviveNavigations: boolean
            }): Promise<void>
            injectJQuery(page: Page): Promise<void>
            injectUnderscore(page: Page): Promise<void>
            blockRequests(page: Page, options?: BlockRequestsOptions): Promise<void>
            enqueueLinksByClickingElements(options: EnqueueLinksOptions): Promise<QueueOperationInfo[]>
            addInterceptRequestHandler(page: Page, handler: RequestHandler): Promise<void>
            removeInterceptRequestHandler<T extends RequestHandler>(page: Page, handler: T): Promise<void>
            blockResources(page: Page, resourceTypes?: ResourceType[]): Promise<void>
            /**
             * @deprecated
             */
            cacheResponses(page: Page, cache: object, responseUrlRules: Array<(string | RegExp)>): Promise<void>
            compileScript(scriptstring: string, context: { page: Page, request: Request }): Promise<void>
        }

        social: {
            LINKEDIN_REGEX: RegExp
            LINKEDIN_REGEX_GLOBAL: RegExp
            INSTAGRAM_REGEX: RegExp
            INSTAGRAM_REGEX_GLOBAL: RegExp
            TWITTER_REGEX: RegExp
            TWITTER_REGEX_GLOBAL: RegExp
            FACEBOOK_REGEX: RegExp
            FACEBOOK_REGEX_GLOBAL: RegExp
            EMAIL_REGEX: RegExp
            EMAIL_REGEX_GLOBAL: RegExp
            emailsFromText(text: string): Array<string>
            emailsFromUrls(urls: string[]): Array<string>
            phonesFromText(text: string): Array<string>
            phonesFromUrls(urls: string[]): Array<string>
            parseHandlesFromHtml(html: string, data?: object): {
                emails?: string[]
                phones?: string[]
                phonesUncertain?: string[]
                linkedIns?: string[]
                twitters?: string[]
                instagrams?: string[]
                facebooks?: string[]
            }
        }
    }
}
