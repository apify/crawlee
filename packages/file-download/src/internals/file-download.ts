import type {
    ErrorHandler,
    GetUserDataFromRequest,
    HttpCrawlerOptions,
    InternalHttpCrawlingContext,
    InternalHttpHook,
    RequestHandler,
    RouterRoutes,
} from '@crawlee/http';
import {
    HttpCrawler,
    Router,
} from '@crawlee/http';
import type { Dictionary } from '@crawlee/types';

export type FileDownloadErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > = ErrorHandler<FileDownloadCrawlingContext<UserData, JSONData>>;

export interface FileDownloadCrawlerOptions<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > extends HttpCrawlerOptions<FileDownloadCrawlingContext<UserData, JSONData>> {}

export type FileDownloadHook<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > = InternalHttpHook<FileDownloadCrawlingContext<UserData, JSONData>>;

export interface FileDownloadCrawlingContext<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > extends InternalHttpCrawlingContext<UserData, JSONData, FileDownload> {}

export type FileDownloadRequestHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    > = RequestHandler<FileDownloadCrawlingContext<UserData, JSONData>>;

/**
    Provides a framework for the parallel file download using plain HTTP requests. The URLs to download are fed either from a static list of URLs or can be added dynamically from another source.

    Since `FileDownload` uses raw HTTP requests to download the files, it is very fast and efficient on data bandwidth. 
    However, it doesn't parse the content - if you need to e.g. extract data from the downloaded files, 
    you might need to use [CheerioCrawler](https://crawlee.dev/api/cheerio-crawler/class/CheerioCrawler), 
    [PuppeteerCrawler](https://crawlee.dev/api/puppeteer-crawler/class/PuppeteerCrawler) or [PlaywrightCrawler](https://crawlee.dev/api/playwright-crawler/class/PlaywrightCrawler) instead.

    `FileCrawler` downloads each URL using a plain HTTP request and then invokes the user-provided [FileCrawlerOptions.requestHandler](https://crawlee.dev/api/file-crawler/interface/FileCrawlerOptions#requestHandler) where the user can specify what to do with the downloaded data.

    The source URLs are represented using [Request](https://crawlee.dev/api/core/class/Request) objects that are fed from [RequestList](https://crawlee.dev/api/core/class/RequestList) or [RequestQueue](https://crawlee.dev/api/core/class/RequestQueue) instances provided by the [FileCrawlerOptions.requestList](https://crawlee.dev/api/file-crawler/interface/FileCrawlerOptions#requestList) or [FileCrawlerOptions.requestQueue](https://crawlee.dev/api/file-crawler/interface/FileCrawlerOptions#requestQueue) constructor options, respectively.

    If both [FileCrawlerOptions.requestList](https://crawlee.dev/api/file-crawler/interface/FileCrawlerOptions#requestList) and [FileCrawlerOptions.requestQueue](https://crawlee.dev/api/file-crawler/interface/FileCrawlerOptions#requestQueue) are used, the instance first processes URLs from the [RequestList](https://crawlee.dev/api/core/class/RequestList) and automatically enqueues all of them to [RequestQueue](https://crawlee.dev/api/core/class/RequestQueue) before it starts their processing. This ensures that a single URL is not crawled multiple times.

    The crawler finishes when there are no more [Request](https://crawlee.dev/api/core/class/Request) objects to crawl.

    We can use the `preNavigationHooks` to adjust `gotOptions`:
        
    ```
    preNavigationHooks: [
        (crawlingContext, gotOptions) => {
            // ...
        },
    ]
    ```
        
    New requests are only dispatched when there is enough free CPU and memory available, using the functionality provided by the [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) class. All [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) configuration options can be passed to the `autoscaledPoolOptions` parameter of the `FileCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency` [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) options are available directly in the `FileCrawler` constructor.
        
    ## Example usage
        
    ```ts
    const crawler = new FileDownloader({
        requestHandler({ body, request }) {
            writeFileSync(request.url.replace(/[^a-z0-9\.]/gi, '_'), body);
        },
    });

    await crawler.run([
        'http://www.example.com/document.pdf',
        'http://www.example.com/sound.mp3',
        'http://www.example.com/video.mkv',
    ]);
    ``` 
*/
export class FileDownload extends HttpCrawler<FileDownloadCrawlingContext> {
    constructor(options: FileDownloadCrawlerOptions = {}) {
        super(options);
        (this as any).supportedMimeTypes = new Set(['*/*']);
    }

    protected override async _runRequestHandler(context: FileDownloadCrawlingContext) {
        await super._runRequestHandler(context);
    }
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
    UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
>(routes?: RouterRoutes<Context, UserData>) {
    return Router.create<Context>(routes);
}
