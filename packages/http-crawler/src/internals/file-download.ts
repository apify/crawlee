import { finished } from 'stream/promises';
import { isPromise } from 'util/types';

import type { Dictionary } from '@crawlee/types';

import type {
    ErrorHandler,
    GetUserDataFromRequest,
    HttpCrawlerOptions,
    InternalHttpCrawlingContext,
    InternalHttpHook,
    RequestHandler,
    RouterRoutes,
} from '../index';
import {
    HttpCrawler,
    Router,
} from '../index';

export type FileDownloadErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = ErrorHandler<FileDownloadCrawlingContext<UserData, JSONData>>;

export type StreamHandlerContext = Omit<FileDownloadCrawlingContext, 'body' | 'response' | 'parseWithCheerio' | 'json' | 'addRequests' | 'contentType'> & {
    stream: ReadableStream;
};

type StreamHandler = (context: StreamHandlerContext) => void | Promise<void>;

export type FileDownloadCrawlerOptions<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> =
(Omit<HttpCrawlerOptions<FileDownloadCrawlingContext<UserData, JSONData>>, 'requestHandler' > & { requestHandler?: never; streamHandler?: StreamHandler }) |
// eslint-disable-next-line max-len
(Omit<HttpCrawlerOptions<FileDownloadCrawlingContext<UserData, JSONData>>, 'requestHandler' > & { requestHandler: FileDownloadRequestHandler; streamHandler?: never });

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
 * Provides a framework for the parallel file download using plain HTTP requests. The URLs to download are fed either from a static list of URLs or can be added dynamically from another source.
 *
 * Since `FileDownload` uses raw HTTP requests to download the files, it is very fast and efficient on data bandwidth.
 * However, it doesn't parse the content - if you need to e.g. extract data from the downloaded files,
 * you might need to use [CheerioCrawler](https://crawlee.dev/api/cheerio-crawler/class/CheerioCrawler),
 * [PuppeteerCrawler](https://crawlee.dev/api/puppeteer-crawler/class/PuppeteerCrawler) or [PlaywrightCrawler](https://crawlee.dev/api/playwright-crawler/class/PlaywrightCrawler) instead.
 *
 * `FileCrawler` downloads each URL using a plain HTTP request and then invokes the user-provided [FileCrawlerOptions.requestHandler](https://crawlee.dev/api/file-crawler/interface/FileCrawlerOptions#requestHandler) where the user can specify what to do with the downloaded data.
 *
 * The source URLs are represented using [Request](https://crawlee.dev/api/core/class/Request) objects that are fed from [RequestList](https://crawlee.dev/api/core/class/RequestList) or [RequestQueue](https://crawlee.dev/api/core/class/RequestQueue) instances provided by the [FileCrawlerOptions.requestList](https://crawlee.dev/api/file-crawler/interface/FileCrawlerOptions#requestList) or [FileCrawlerOptions.requestQueue](https://crawlee.dev/api/file-crawler/interface/FileCrawlerOptions#requestQueue) constructor options, respectively.
 *
 * If both [FileCrawlerOptions.requestList](https://crawlee.dev/api/file-crawler/interface/FileCrawlerOptions#requestList) and [FileCrawlerOptions.requestQueue](https://crawlee.dev/api/file-crawler/interface/FileCrawlerOptions#requestQueue) are used, the instance first processes URLs from the [RequestList](https://crawlee.dev/api/core/class/RequestList) and automatically enqueues all of them to [RequestQueue](https://crawlee.dev/api/core/class/RequestQueue) before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more [Request](https://crawlee.dev/api/core/class/Request) objects to crawl.
 *
 * We can use the `preNavigationHooks` to adjust `gotOptions`:
 *
 * ```
 * preNavigationHooks: [
 *     (crawlingContext, gotOptions) => {
 *         // ...
 *     },
 * ]
 * ```
 *
 * New requests are only dispatched when there is enough free CPU and memory available, using the functionality provided by the [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) class. All [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) configuration options can be passed to the `autoscaledPoolOptions` parameter of the `FileCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency` [AutoscaledPool](https://crawlee.dev/api/core/class/AutoscaledPool) options are available directly in the `FileCrawler` constructor.
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
export class FileDownload extends HttpCrawler<FileDownloadCrawlingContext> {
    private streamHandler?: StreamHandler;

    constructor(options: FileDownloadCrawlerOptions = {}) {
        const { streamHandler } = options;
        delete options.streamHandler;
        super(options);

        this.streamHandler = streamHandler;
        if (this.streamHandler) {
            this.requestHandler = this.streamRequestHandler;
        }

        (this as any).supportedMimeTypes = new Set(['*/*']);
    }

    protected override async _runRequestHandler(context: FileDownloadCrawlingContext) {
        if (this.streamHandler) {
            context.request.skipNavigation = true;
        }

        await super._runRequestHandler(context);
    }

    private async streamRequestHandler(context: FileDownloadCrawlingContext) {
        const { log, request: { url } } = context;

        const { gotScraping } = await import('got-scraping');

        const stream = gotScraping.stream({
            url,
            timeout: { request: undefined },
            proxyUrl: context.proxyInfo?.url,
            isStream: true,
        });

        let pollingInterval: NodeJS.Timeout | undefined;

        const cleanUp = () => {
            clearInterval(pollingInterval!);
            stream.destroy();
        };

        const downloadPromise = new Promise<void>((resolve, reject) => {
            pollingInterval = setInterval(() => {
                const { total, transferred } = stream.downloadProgress;

                if (transferred > 0) {
                    log.info(
                        `Downloaded ${transferred} bytes of ${total ?? 0} bytes from ${url}.`,
                    );
                }
            }, 1000);

            stream.on('error', async (error: Error) => {
                cleanUp();
                reject(error);
            });

            let streamHandlerResult;

            try {
                context.stream = stream;
                streamHandlerResult = this.streamHandler!(context as any);
            } catch (e) {
                cleanUp();
                reject(e);
            }

            if (isPromise(streamHandlerResult)) {
                streamHandlerResult.then(() => {
                    resolve();
                }).catch((e: Error) => {
                    cleanUp();
                    reject(e);
                });
            } else {
                resolve();
            }
        });

        await Promise.all([
            downloadPromise,
            finished(stream),
        ]);

        cleanUp();
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
