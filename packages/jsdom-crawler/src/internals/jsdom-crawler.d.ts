import type { AddRequestsBatchedResult, ContextPipeline, CrawlingContext, EnqueueLinksOptions, ErrorHandler, ExtractLinksOptions, GetUserDataFromRequest, HttpCrawlerOptions, InternalHttpCrawlingContext, InternalHttpHook, RequestHandler, RouterHandler, RouterRoutes, RouteSchemas, RoutesFromSchemas } from '@crawlee/http';
import { HttpCrawler } from '@crawlee/http';
import type { Dictionary } from '@crawlee/types';
import type { CheerioAPI } from 'cheerio';
import type { DOMWindow } from 'jsdom';
import { VirtualConsole } from 'jsdom';
import { z } from 'zod';
export type JSDOMErrorHandler<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
ContextExtension = Dictionary<never>> = ErrorHandler<CrawlingContext, JSDOMCrawlingContext<UserData, JSONData> & ContextExtension>;
export interface JSDOMCrawlerOptions<ContextExtension = Dictionary<never>, ExtendedContext extends JSDOMCrawlingContext = JSDOMCrawlingContext & ContextExtension, UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
Routes extends Record<keyof Routes, Dictionary> = Record<string, UserData>, StatisticStateExtension extends object = {}> extends HttpCrawlerOptions<JSDOMCrawlingContext<UserData, JSONData>, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    /**
     * Download and run scripts.
     */
    runScripts?: boolean;
    /**
     * Suppress the logs from JSDOM internal console.
     */
    hideInternalConsole?: boolean;
}
export type JSDOMHook<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> = InternalHttpHook<JSDOMCrawlingContext<UserData, JSONData>>;
export interface JSDOMCrawlingContext<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> extends InternalHttpCrawlingContext<UserData, JSONData> {
    window: DOMWindow;
    document: Document;
    body: string;
    /**
     * Wait for an element matching the selector to appear.
     * Timeout defaults to 5s.
     *
     * **Example usage:**
     * ```ts
     * async requestHandler({ waitForSelector, parseWithCheerio }) {
     *     await waitForSelector('article h1');
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    waitForSelector(selector: string, timeoutMs?: number): Promise<void>;
    /**
     * Returns Cheerio handle, allowing to work with the data same way as with {@apilink CheerioCrawler}.
     * When provided with the `selector` argument, it will first look for the selector with a 5s timeout.
     *
     * **Example usage:**
     * ```javascript
     * async requestHandler({ parseWithCheerio }) {
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    parseWithCheerio(selector?: string, timeoutMs?: number): Promise<CheerioAPI>;
    /**
     * Extracts URLs from the parsed DOM, without adding them to the request queue.
     */
    extractLinks(options?: ExtractLinksOptions): Promise<string[]>;
    /**
     * Helper function for extracting URLs from the parsed DOM and adding them to the request queue.
     */
    enqueueLinks(options?: EnqueueLinksOptions): Promise<AddRequestsBatchedResult>;
}
export type JSDOMRequestHandler<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
JSONData extends Dictionary = any> = RequestHandler<JSDOMCrawlingContext<UserData, JSONData>>;
export declare class JSDOMCrawler<ContextExtension = Dictionary<never>, ExtendedContext extends JSDOMCrawlingContext = JSDOMCrawlingContext & ContextExtension, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<JSDOMCrawlingContext['request']>>, StatisticStateExtension extends object = {}> extends HttpCrawler<JSDOMCrawlingContext, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    #private;
    /**
     * @internal
     */
    protected static optionsShape: {
        runScripts: z.ZodOptional<z.ZodBoolean>;
        hideInternalConsole: z.ZodOptional<z.ZodBoolean>;
        navigationTimeoutSecs: z.ZodDefault<z.ZodCustom<number, number>>;
        ignoreTlsErrors: z.ZodDefault<z.ZodBoolean>;
        additionalMimeTypes: z.ZodDefault<z.ZodArray<z.ZodString>>;
        suggestResponseEncoding: z.ZodOptional<z.ZodString>;
        forceResponseEncoding: z.ZodOptional<z.ZodString>;
        saveResponseCookies: z.ZodDefault<z.ZodBoolean>;
        preNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
        postNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
        contextPipelineBuilder: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        extendContext: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        requestList: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestQueue: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestManager: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        requestHandlerTimeoutSecs: z.ZodOptional<z.ZodCustom<number, number>>;
        errorHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        failedRequestHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        maxRequestRetries: z.ZodDefault<z.ZodCustom<number, number>>;
        sameDomainDelaySecs: z.ZodDefault<z.ZodCustom<number, number>>;
        maxRequestsPerCrawl: z.ZodOptional<z.ZodCustom<number, number>>;
        maxCrawlDepth: z.ZodOptional<z.ZodCustom<number, number>>;
        taskLoopOptions: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        concurrencySystem: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        sessionPool: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        proxyConfiguration: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        statusMessageLoggingInterval: z.ZodDefault<z.ZodCustom<number, number>>;
        statusMessageCallback: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        additionalHttpErrorStatusCodes: z.ZodDefault<z.ZodArray<z.ZodCustom<number, number>>>;
        ignoreHttpErrorStatusCodes: z.ZodDefault<z.ZodArray<z.ZodCustom<number, number>>>;
        blockedStatusCodes: z.ZodOptional<z.ZodArray<z.ZodCustom<number, number>>>;
        retryOnBlocked: z.ZodDefault<z.ZodBoolean>;
        respectRobotsTxtFile: z.ZodDefault<z.ZodUnion<readonly [z.ZodBoolean, z.ZodCustom<Dictionary, Dictionary>]>>;
        transactionalStorage: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodObject<{
            requestQueue: z.ZodOptional<z.ZodEnum<{
                deferred: "deferred";
                writeThrough: "writeThrough";
            }>>;
        }, z.core.$strict>]>>;
        onSkippedRequest: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        httpClient: z.ZodOptional<z.ZodCustom<import("@crawlee/http-client").BaseHttpClient, import("@crawlee/http-client").BaseHttpClient>>;
        configuration: z.ZodOptional<z.ZodCustom<import("@crawlee/http").Configuration, import("@crawlee/http").Configuration>>;
        storageBackend: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        eventManager: z.ZodOptional<z.ZodCustom<import("@crawlee/http").EventManager, import("@crawlee/http").EventManager>>;
        logger: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        minConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxRequestsPerMinute: z.ZodOptional<z.ZodCustom<number, number>>;
        keepAlive: z.ZodOptional<z.ZodBoolean>;
        statistics: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        id: z.ZodOptional<z.ZodString>;
    };
    /** @internal */
    protected static optionsSchema: z.ZodObject<{
        runScripts: z.ZodOptional<z.ZodBoolean>;
        hideInternalConsole: z.ZodOptional<z.ZodBoolean>;
        navigationTimeoutSecs: z.ZodDefault<z.ZodCustom<number, number>>;
        ignoreTlsErrors: z.ZodDefault<z.ZodBoolean>;
        additionalMimeTypes: z.ZodDefault<z.ZodArray<z.ZodString>>;
        suggestResponseEncoding: z.ZodOptional<z.ZodString>;
        forceResponseEncoding: z.ZodOptional<z.ZodString>;
        saveResponseCookies: z.ZodDefault<z.ZodBoolean>;
        preNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
        postNavigationHooks: z.ZodDefault<z.ZodCustom<unknown[], unknown[]>>;
        contextPipelineBuilder: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        extendContext: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        requestList: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestQueue: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestManager: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        requestHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        requestHandlerTimeoutSecs: z.ZodOptional<z.ZodCustom<number, number>>;
        errorHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        failedRequestHandler: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        maxRequestRetries: z.ZodDefault<z.ZodCustom<number, number>>;
        sameDomainDelaySecs: z.ZodDefault<z.ZodCustom<number, number>>;
        maxRequestsPerCrawl: z.ZodOptional<z.ZodCustom<number, number>>;
        maxCrawlDepth: z.ZodOptional<z.ZodCustom<number, number>>;
        taskLoopOptions: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        concurrencySystem: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        sessionPool: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        proxyConfiguration: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        statusMessageLoggingInterval: z.ZodDefault<z.ZodCustom<number, number>>;
        statusMessageCallback: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        additionalHttpErrorStatusCodes: z.ZodDefault<z.ZodArray<z.ZodCustom<number, number>>>;
        ignoreHttpErrorStatusCodes: z.ZodDefault<z.ZodArray<z.ZodCustom<number, number>>>;
        blockedStatusCodes: z.ZodOptional<z.ZodArray<z.ZodCustom<number, number>>>;
        retryOnBlocked: z.ZodDefault<z.ZodBoolean>;
        respectRobotsTxtFile: z.ZodDefault<z.ZodUnion<readonly [z.ZodBoolean, z.ZodCustom<Dictionary, Dictionary>]>>;
        transactionalStorage: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodObject<{
            requestQueue: z.ZodOptional<z.ZodEnum<{
                deferred: "deferred";
                writeThrough: "writeThrough";
            }>>;
        }, z.core.$strict>]>>;
        onSkippedRequest: z.ZodOptional<z.ZodCustom<(...args: any[]) => unknown, (...args: any[]) => unknown>>;
        httpClient: z.ZodOptional<z.ZodCustom<import("@crawlee/http-client").BaseHttpClient, import("@crawlee/http-client").BaseHttpClient>>;
        configuration: z.ZodOptional<z.ZodCustom<import("@crawlee/http").Configuration, import("@crawlee/http").Configuration>>;
        storageBackend: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        eventManager: z.ZodOptional<z.ZodCustom<import("@crawlee/http").EventManager, import("@crawlee/http").EventManager>>;
        logger: z.ZodOptional<z.ZodType<Dictionary<any>, unknown, z.core.$ZodTypeInternals<Dictionary<any>, unknown>>>;
        minConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxConcurrency: z.ZodOptional<z.ZodCustom<number, number>>;
        maxRequestsPerMinute: z.ZodOptional<z.ZodCustom<number, number>>;
        keepAlive: z.ZodOptional<z.ZodBoolean>;
        statistics: z.ZodOptional<z.ZodCustom<Dictionary, Dictionary>>;
        id: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    constructor(options?: JSDOMCrawlerOptions<ContextExtension, ExtendedContext, any, any, Routes, StatisticStateExtension>);
    protected buildContextPipeline(): ContextPipeline<CrawlingContext, JSDOMCrawlingContext>;
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
    private parseContent;
    private addHelpers;
}
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
export declare function createJSDOMRouter<Context extends JSDOMCrawlingContext = JSDOMCrawlingContext, Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>>(routes?: RouterRoutes<Context, Routes>): RouterHandler<Context, Routes>;
export declare function createJSDOMRouter<Context extends JSDOMCrawlingContext = JSDOMCrawlingContext, UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(routes?: RouterRoutes<Context, Record<string, UserData>>): RouterHandler<Context, Record<string, UserData>>;
export declare function createJSDOMRouter<Context extends JSDOMCrawlingContext = JSDOMCrawlingContext, const Schemas extends RouteSchemas = RouteSchemas>(schemas: Schemas): RouterHandler<Context, RoutesFromSchemas<Schemas>>;
