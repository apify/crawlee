import type { BasicCrawlerOptions, ContextPipeline, CrawlingContext, LoadedRequest, Request } from '@crawlee/basic';
import { BasicCrawler } from '@crawlee/basic';
import { ResponseWithUrl } from '@crawlee/http-client';
import type { Dictionary } from '@crawlee/types';

import type {
    ErrorHandler,
    GetUserDataFromRequest,
    RequestHandler,
    RouterHandler,
    RouterRoutes,
    RouteSchemas,
    RoutesFromSchemas,
} from '../index.js';
import { Router } from '../index.js';
import { parseContentTypeFromResponse } from './utils.js';

const kBodyDrained = Symbol('bodyDrained');

export type FileDownloadErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    ContextExtension = Dictionary<never>,
> = ErrorHandler<CrawlingContext, FileDownloadCrawlingContext<UserData> & ContextExtension>;

export interface FileDownloadCrawlingContext<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> extends CrawlingContext<UserData> {
    request: LoadedRequest<Request<UserData>>;
    response: Response;
    contentType: { type: string; encoding: BufferEncoding };
}

export type FileDownloadRequestHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = RequestHandler<FileDownloadCrawlingContext<UserData>>;

/**
 * Provides a framework for downloading files in parallel using plain HTTP requests. The URLs to download are fed either from a static list of URLs or they can be added on the fly from another crawler.
 *
 * Since `FileDownload` uses raw HTTP requests to download the files, it is very fast and bandwidth-efficient.
 * However, it doesn't parse the content - if you need to e.g. extract data from the downloaded files,
 * you might need to use {@apilink CheerioCrawler}, {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler} instead.
 *
 * `FileCrawler` downloads each URL using a plain HTTP request and then invokes the user-provided {@apilink BasicCrawlerOptions.requestHandler} where the user can specify what to do with the downloaded data.
 *
 * The source URLs are represented using {@apilink Request} objects that are fed from the {@apilink IRequestManager|request manager} provided via the {@apilink BasicCrawlerOptions.requestManager|`requestManager`} constructor option (a {@apilink RequestQueue} is itself a request manager). To read from a read-only source such as a {@apilink RequestList} while still being able to enqueue new requests, combine it with a queue into a {@apilink RequestManagerTandem} via {@apilink IRequestLoader.toTandem|`requestLoader.toTandem()`} and pass the result as `requestManager`.
 *
 * > The {@apilink BasicCrawlerOptions.requestList|`requestList`} and {@apilink BasicCrawlerOptions.requestQueue|`requestQueue`} options are deprecated; they are still accepted and folded into a single `requestManager` for back-compat.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
 *
 * We can use the `preNavigationHooks` to adjust the crawling context before the request is made:
 *
 * ```
 * preNavigationHooks: [
 *     (crawlingContext) => {
 *         // ...
 *     },
 * ]
 * ```
 *
 * New requests are only dispatched when there is enough free CPU and memory available, as judged by the crawler's {@apilink ConcurrencySystem}. Concurrency is tuned via the `minConcurrency`, `maxConcurrency` and `maxRequestsPerMinute` options of the `FileCrawler` constructor, or, for finer control, by injecting a pre-configured {@apilink ConcurrencySystem|`concurrencySystem`}.
 *
 * ## Example usage
 *
 * ```ts
 * const crawler = new FileDownloader({
 *     requestHandler({ body, request }) {
 *         writeFileSync(request.url.replace(/[^a-z0-9\.]/gi, '_'), body);
 *     },
 * });
 *
 * await crawler.run([
 *     'http://www.example.com/document.pdf',
 *     'http://www.example.com/sound.mp3',
 *     'http://www.example.com/video.mkv',
 * ]);
 * ```
 */
export class FileDownload extends BasicCrawler<FileDownloadCrawlingContext> {
    // TODO hooks
    constructor(options: BasicCrawlerOptions<FileDownloadCrawlingContext> = {}) {
        super({
            ...options,
            contextPipelineBuilder: () => this.#buildContextPipeline(),
        });
    }

    #buildContextPipeline(): ContextPipeline<CrawlingContext, FileDownloadCrawlingContext> {
        return super.buildContextPipeline().compose({
            action: async (context) => this.initiateDownload(context),
            cleanup: async (context) => {
                if (!context.response.bodyUsed) {
                    // Nobody consumed the body — cancel it so the
                    // underlying connection can be released.
                    await context.response.body?.cancel();
                }

                await (context as { [kBodyDrained]: Promise<void> })[kBodyDrained];
            },
        });
    }

    private async initiateDownload(context: CrawlingContext) {
        const response = await this.httpClient.sendRequest(context.request.intoFetchAPIRequest(), {
            session: context.session,
        });

        const { type, charset: encoding } = parseContentTypeFromResponse(response);

        context.request.url = response.url;

        const { response: trackedResponse, bodyDrained } = trackBodyConsumption(response);

        const contextExtension = {
            request: context.request as LoadedRequest<Request>,
            response: trackedResponse,
            contentType: { type, encoding },
            [kBodyDrained]: bodyDrained,
        };

        return contextExtension;
    }
}

/**
 * Wraps a Response so that we can track when the body stream has been fully
 * consumed (or errored). Pipes the original body through a TransformStream;
 * the readable side becomes the new Response body, and `pipeTo` gives us a
 * promise that resolves once the body is fully read or cancelled.
 */
function trackBodyConsumption(response: Response): { response: ResponseWithUrl; bodyDrained: Promise<void> } {
    if (!response.body) {
        return { response, bodyDrained: Promise.resolve() };
    }

    const passthrough = new TransformStream();
    const bodyDrained = response.body.pipeTo(passthrough.writable).catch(() => {});

    const trackedResponse = new ResponseWithUrl(passthrough.readable, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
        url: response.url,
    });

    return { response: trackedResponse, bodyDrained };
}

/**
 * Creates new {@apilink Router} instance that works based on request labels.
 * This instance can then serve as a `requestHandler` of your {@apilink FileDownload}.
 * Defaults to the {@apilink FileDownloadCrawlingContext}.
 *
 * > Serves as a shortcut for using `Router.create<FileDownloadCrawlingContext>()`.
 *
 * ```ts
 * import { FileDownload, createFileRouter } from 'crawlee';
 *
 * const router = createFileRouter();
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new FileDownload({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 */
export function createFileRouter<
    Context extends FileDownloadCrawlingContext = FileDownloadCrawlingContext,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>,
>(routes?: RouterRoutes<Context, Routes>): RouterHandler<Context, Routes>;
export function createFileRouter<
    Context extends FileDownloadCrawlingContext = FileDownloadCrawlingContext,
    UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
>(routes?: RouterRoutes<Context, Record<string, UserData>>): RouterHandler<Context, Record<string, UserData>>;
export function createFileRouter<
    Context extends FileDownloadCrawlingContext = FileDownloadCrawlingContext,
    const Schemas extends RouteSchemas = RouteSchemas,
>(schemas: Schemas): RouterHandler<Context, RoutesFromSchemas<Schemas>>;
export function createFileRouter(routesOrSchemas?: any): any {
    return Router.create(routesOrSchemas);
}
