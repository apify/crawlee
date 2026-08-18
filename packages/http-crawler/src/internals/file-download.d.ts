import { Transform } from 'node:stream';
import type { BasicCrawlerOptions } from '@crawlee/basic';
import { BasicCrawler } from '@crawlee/basic';
import type { ContextPipeline, CrawlingContext, LoadedRequest, Request } from '@crawlee/core';
import type { Dictionary } from '@crawlee/types';
import type { ErrorHandler, GetUserDataFromRequest, InternalHttpHook, RequestHandler, RouterRoutes } from '../index.js';
export type FileDownloadErrorHandler<UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
ContextExtension = Dictionary<never>> = ErrorHandler<CrawlingContext, FileDownloadCrawlingContext<UserData> & ContextExtension>;
export type FileDownloadHook<UserData extends Dictionary = any> = InternalHttpHook<FileDownloadCrawlingContext<UserData>>;
export interface FileDownloadCrawlingContext<UserData extends Dictionary = any> extends CrawlingContext<UserData> {
    request: LoadedRequest<Request<UserData>>;
    response: Response;
    contentType: {
        type: string;
        encoding: BufferEncoding;
    };
}
export type FileDownloadRequestHandler<UserData extends Dictionary = any> = RequestHandler<FileDownloadCrawlingContext<UserData>>;
/**
 * Creates a transform stream that throws an error if the source data speed is below the specified minimum speed.
 * This `Transform` checks the amount of data every `checkProgressInterval` milliseconds.
 * If the stream has received less than `minSpeedKbps * historyLengthMs / 1000` bytes in the last `historyLengthMs` milliseconds,
 * it will throw an error.
 *
 * Can be used e.g. to abort a download if the network speed is too slow.
 * @returns Transform stream that monitors the speed of the incoming data.
 */
export declare function MinimumSpeedStream({ minSpeedKbps, historyLengthMs, checkProgressInterval: checkProgressIntervalMs, }: {
    minSpeedKbps: number;
    historyLengthMs?: number;
    checkProgressInterval?: number;
}): Transform;
/**
 * Creates a transform stream that logs the progress of the incoming data.
 * This `Transform` calls the `logProgress` function every `loggingInterval` milliseconds with the number of bytes received so far.
 *
 * Can be used e.g. to log the progress of a download.
 * @returns Transform stream logging the progress of the incoming data.
 */
export declare function ByteCounterStream({ logTransferredBytes, loggingInterval, }: {
    logTransferredBytes: (transferredBytes: number) => void;
    loggingInterval?: number;
}): Transform;
/**
 * Provides a framework for downloading files in parallel using plain HTTP requests. The URLs to download are fed either from a static list of URLs or they can be added on the fly from another crawler.
 *
 * Since `FileDownload` uses raw HTTP requests to download the files, it is very fast and bandwidth-efficient.
 * However, it doesn't parse the content - if you need to e.g. extract data from the downloaded files,
 * you might need to use {@apilink CheerioCrawler}, {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler} instead.
 *
 * `FileCrawler` downloads each URL using a plain HTTP request and then invokes the user-provided {@apilink FileDownloadOptions.requestHandler} where the user can specify what to do with the downloaded data.
 *
 * The source URLs are represented using {@apilink Request} objects that are fed from the {@apilink IRequestManager|request manager} provided via the {@apilink FileDownloadOptions.requestManager|`requestManager`} constructor option (a {@apilink RequestQueue} is itself a request manager). To read from a read-only source such as a {@apilink RequestList} while still being able to enqueue new requests, combine it with a queue into a {@apilink RequestManagerTandem} via {@apilink IRequestLoader.toTandem|`requestLoader.toTandem()`} and pass the result as `requestManager`.
 *
 * > The {@apilink FileDownloadOptions.requestList|`requestList`} and {@apilink FileDownloadOptions.requestQueue|`requestQueue`} options are deprecated; they are still accepted and folded into a single `requestManager` for back-compat.
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
export declare class FileDownload extends BasicCrawler<FileDownloadCrawlingContext> {
    constructor(options?: BasicCrawlerOptions<FileDownloadCrawlingContext>);
    protected buildContextPipeline(): ContextPipeline<CrawlingContext, FileDownloadCrawlingContext>;
    private initiateDownload;
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
export declare function createFileRouter<Context extends FileDownloadCrawlingContext = FileDownloadCrawlingContext, UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(routes?: RouterRoutes<Context, UserData>): import("@crawlee/basic").RouterHandler<Context, Record<string, GetUserDataFromRequest<Context["request"]>>>;
