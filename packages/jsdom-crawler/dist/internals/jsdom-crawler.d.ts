/// <reference types="node" />
import * as cheerio from 'cheerio';
import type { HttpCrawlerOptions, InternalHttpCrawlingContext, InternalHttpHook, ErrorHandler, RequestHandler, EnqueueLinksOptions, RequestQueue, Configuration } from '@crawlee/http';
import { HttpCrawler } from '@crawlee/http';
import type { Dictionary, GetUserDataFromRequest, RouterRoutes } from '@crawlee/types';
import type { DOMWindow } from 'jsdom';
import { VirtualConsole } from 'jsdom';
import type { IncomingMessage } from 'http';
export type JSDOMErrorHandler<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> = ErrorHandler<JSDOMCrawlingContext<UserData, JSONData>>;
export interface JSDOMCrawlerOptions<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> extends HttpCrawlerOptions<JSDOMCrawlingContext<UserData, JSONData>> {
    /**
     * Download and run scripts.
     */
    runScripts?: boolean;
    /**
     * Supress the logs from JSDOM internal console.
     */
    hideInternalConsole?: boolean;
}
export type JSDOMHook<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> = InternalHttpHook<JSDOMCrawlingContext<UserData, JSONData>>;
export interface JSDOMCrawlingContext<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> extends InternalHttpCrawlingContext<UserData, JSONData, JSDOMCrawler> {
    window: DOMWindow;
    /**
     * Returns Cheerio handle, allowing to work with the data same way as with {@apilink CheerioCrawler}.
     *
     * **Example usage:**
     * ```javascript
     * async requestHandler({ parseWithCheerio }) {
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    parseWithCheerio(): Promise<cheerio.CheerioAPI>;
}
export type JSDOMRequestHandler<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> = RequestHandler<JSDOMCrawlingContext<UserData, JSONData>>;
export declare class JSDOMCrawler extends HttpCrawler<JSDOMCrawlingContext> {
    protected static optionsShape: {
        runScripts: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        hideInternalConsole: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        handlePageFunction: import("ow").Predicate<Function> & import("ow").BasePredicate<Function | undefined>;
        navigationTimeoutSecs: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        ignoreSslErrors: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        additionalMimeTypes: import("ow").ArrayPredicate<string>;
        suggestResponseEncoding: import("ow").StringPredicate & import("ow").BasePredicate<string | undefined>;
        forceResponseEncoding: import("ow").StringPredicate & import("ow").BasePredicate<string | undefined>;
        proxyConfiguration: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
        persistCookiesPerSession: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        preNavigationHooks: import("ow").ArrayPredicate<unknown> & import("ow").BasePredicate<unknown[] | undefined>;
        postNavigationHooks: import("ow").ArrayPredicate<unknown> & import("ow").BasePredicate<unknown[] | undefined>;
        requestList: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
        requestQueue: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
        requestHandler: import("ow").Predicate<Function> & import("ow").BasePredicate<Function | undefined>;
        handleRequestFunction: import("ow").Predicate<Function> & import("ow").BasePredicate<Function | undefined>;
        requestHandlerTimeoutSecs: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        handleRequestTimeoutSecs: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        errorHandler: import("ow").Predicate<Function> & import("ow").BasePredicate<Function | undefined>;
        failedRequestHandler: import("ow").Predicate<Function> & import("ow").BasePredicate<Function | undefined>;
        handleFailedRequestFunction: import("ow").Predicate<Function> & import("ow").BasePredicate<Function | undefined>;
        maxRequestRetries: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        maxRequestsPerCrawl: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        autoscaledPoolOptions: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
        sessionPoolOptions: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
        useSessionPool: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        loggingInterval: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        minConcurrency: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        maxConcurrency: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        maxRequestsPerMinute: import("ow").NumberPredicate & import("ow").BasePredicate<number | undefined>;
        keepAlive: import("ow").BooleanPredicate & import("ow").BasePredicate<boolean | undefined>;
        log: import("ow").ObjectPredicate<object> & import("ow").BasePredicate<object | undefined>;
    };
    protected runScripts: boolean;
    protected hideInternalConsole: boolean;
    protected virtualConsole: VirtualConsole | null;
    constructor(options?: JSDOMCrawlerOptions, config?: Configuration);
    /**
     * Returns the currently used `VirtualConsole` instance. Can be used to listen for the JSDOM's internal console messages.
     *
     * If the `hideInternalConsole` option is set to `true`, the messages aren't logged to the console by default,
     * but the virtual console can still be listened to.
     *
     * **Example usage:**
     * ```javascript
     * const console = crawler.getVirtualConsole();
     * console.on('error', (e) => {
     *     log.error(e);
     * });
     * ```
     */
    getVirtualConsole(): VirtualConsole;
    private readonly jsdomErrorHandler;
    protected _cleanupContext(context: JSDOMCrawlingContext): Promise<void>;
    protected _parseHTML(response: IncomingMessage, isXml: boolean, crawlingContext: JSDOMCrawlingContext): Promise<{
        window: DOMWindow;
        readonly body: string;
        enqueueLinks: (enqueueOptions?: EnqueueLinksOptions) => Promise<import("@crawlee/types").BatchAddRequestsResult>;
    }>;
    _runRequestHandler(context: JSDOMCrawlingContext): Promise<void>;
}
interface EnqueueLinksInternalOptions {
    options?: EnqueueLinksOptions;
    window: DOMWindow | null;
    requestQueue: RequestQueue;
    originalRequestUrl: string;
    finalRequestUrl?: string;
}
/** @internal */
export declare function domCrawlerEnqueueLinks({ options, window, requestQueue, originalRequestUrl, finalRequestUrl }: EnqueueLinksInternalOptions): Promise<import("@crawlee/types").BatchAddRequestsResult>;
/**
 * Creates new {@apilink Router} instance that works based on request labels.
 * This instance can then serve as a `requestHandler` of your {@apilink JSDOMCrawler}.
 * Defaults to the {@apilink JSDOMCrawlingContext}.
 *
 * > Serves as a shortcut for using `Router.create<JSDOMCrawlingContext>()`.
 *
 * ```ts
 * import { JSDOMCrawler, createJSDOMRouter } from 'crawlee';
 *
 * const router = createJSDOMRouter();
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new JSDOMCrawler({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 */
export declare function createJSDOMRouter<Context extends JSDOMCrawlingContext = JSDOMCrawlingContext, UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(routes?: RouterRoutes<Context, UserData>): import("@crawlee/http").RouterHandler<Context>;
export {};
//# sourceMappingURL=jsdom-crawler.d.ts.map