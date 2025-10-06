import { Transform } from 'node:stream';
import { finished } from 'node:stream/promises';
import { isPromise } from 'node:util/types';

import type { Dictionary } from '@crawlee/types';
// @ts-expect-error got-scraping is ESM only
import type { Request } from 'got-scraping';

import type {
    ErrorHandler,
    GetUserDataFromRequest,
    HttpCrawlerOptions,
    InternalHttpCrawlingContext,
    InternalHttpHook,
    RequestHandler,
    RouterRoutes,
} from '../index';
import { HttpCrawler, Router } from '../index';

export type FileDownloadErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = ErrorHandler<FileDownloadCrawlingContext<UserData, JSONData>>;

export type StreamHandlerContext = Omit<
    FileDownloadCrawlingContext,
    'body' | 'parseWithCheerio' | 'json' | 'addRequests' | 'contentType'
> & {
    stream: Request; // TODO BC - remove in v4
};

type StreamHandler = (context: StreamHandlerContext) => void | Promise<void>;

export type FileDownloadOptions<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> =
    | (Omit<HttpCrawlerOptions<FileDownloadCrawlingContext<UserData, JSONData>>, 'requestHandler'> & {
          requestHandler?: never;
          streamHandler?: StreamHandler;
      })
    | (Omit<HttpCrawlerOptions<FileDownloadCrawlingContext<UserData, JSONData>>, 'requestHandler'> & {
          requestHandler: FileDownloadRequestHandler;
          streamHandler?: never;
      });

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
 * Creates a transform stream that throws an error if the source data speed is below the specified minimum speed.
 * This `Transform` checks the amount of data every `checkProgressInterval` milliseconds.
 * If the stream has received less than `minSpeedKbps * historyLengthMs / 1000` bytes in the last `historyLengthMs` milliseconds,
 * it will throw an error.
 *
 * Can be used e.g. to abort a download if the network speed is too slow.
 * @returns Transform stream that monitors the speed of the incoming data.
 */
export function MinimumSpeedStream({
    minSpeedKbps,
    historyLengthMs = 10e3,
    checkProgressInterval: checkProgressIntervalMs = 5e3,
}: {
    minSpeedKbps: number;
    historyLengthMs?: number;
    checkProgressInterval?: number;
}): Transform {
    let snapshots: { timestamp: number; bytes: number }[] = [];

    const checkInterval = setInterval(() => {
        const now = Date.now();

        snapshots = snapshots.filter((snapshot) => now - snapshot.timestamp < historyLengthMs);
        const totalBytes = snapshots.reduce((acc, snapshot) => acc + snapshot.bytes, 0);
        const elapsed = (now - (snapshots[0]?.timestamp ?? 0)) / 1000;

        if (totalBytes / 1024 / elapsed < minSpeedKbps) {
            clearInterval(checkInterval);
            stream.emit('error', new Error(`Stream speed too slow, aborting...`));
        }
    }, checkProgressIntervalMs);

    const stream = new Transform({
        transform: (chunk, _, callback) => {
            snapshots.push({ timestamp: Date.now(), bytes: chunk.length });
            callback(null, chunk);
        },
        final: (callback) => {
            clearInterval(checkInterval);
            callback();
        },
    });

    return stream;
}

/**
 * Creates a transform stream that logs the progress of the incoming data.
 * This `Transform` calls the `logProgress` function every `loggingInterval` milliseconds with the number of bytes received so far.
 *
 * Can be used e.g. to log the progress of a download.
 * @returns Transform stream logging the progress of the incoming data.
 */
export function ByteCounterStream({
    logTransferredBytes,
    loggingInterval = 5000,
}: {
    logTransferredBytes: (transferredBytes: number) => void;
    loggingInterval?: number;
}): Transform {
    let transferredBytes = 0;
    let lastLogTime = Date.now();

    return new Transform({
        transform: (chunk, _, callback) => {
            transferredBytes += chunk.length;

            if (Date.now() - lastLogTime > loggingInterval) {
                lastLogTime = Date.now();
                logTransferredBytes(transferredBytes);
            }

            callback(null, chunk);
        },
        flush: (callback) => {
            logTransferredBytes(transferredBytes);
            callback();
        },
    });
}

/**
 * Provides a framework for downloading files in parallel using plain HTTP requests. The URLs to download are fed either from a static list of URLs or they can be added on the fly from another crawler.
 *
 * Since `FileDownload` uses raw HTTP requests to download the files, it is very fast and bandwidth-efficient.
 * However, it doesn't parse the content - if you need to e.g. extract data from the downloaded files,
 * you might need to use {@apilink CheerioCrawler}, {@apilink PuppeteerCrawler} or {@apilink PlaywrightCrawler} instead.
 *
 * `FileCrawler` downloads each URL using a plain HTTP request and then invokes the user-provided {@apilink FileDownloadOptions.requestHandler} where the user can specify what to do with the downloaded data.
 *
 * The source URLs are represented using {@apilink Request} objects that are fed from {@apilink RequestList} or {@apilink RequestQueue} instances provided by the {@apilink FileDownloadOptions.requestList} or {@apilink FileDownloadOptions.requestQueue} constructor options, respectively.
 *
 * If both {@apilink FileDownloadOptions.requestList} and {@apilink FileDownloadOptions.requestQueue} are used, the instance first processes URLs from the {@apilink RequestList} and automatically enqueues all of them to {@apilink RequestQueue} before it starts their processing. This ensures that a single URL is not crawled multiple times.
 *
 * The crawler finishes when there are no more {@apilink Request} objects to crawl.
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
 * New requests are only dispatched when there is enough free CPU and memory available, using the functionality provided by the {@apilink AutoscaledPool} class. All {@apilink AutoscaledPool} configuration options can be passed to the `autoscaledPoolOptions` parameter of the `FileCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency` {@apilink AutoscaledPool} options are available directly in the `FileCrawler` constructor.
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

    constructor(options: FileDownloadOptions = {}) {
        const { streamHandler } = options;
        delete options.streamHandler;

        if (streamHandler) {
            // For streams, the navigation is done in the request handler.
            (options as any).requestHandlerTimeoutSecs = options.navigationTimeoutSecs ?? 120;
        }

        super(options);

        this.streamHandler = streamHandler;
        if (this.streamHandler) {
            this.requestHandler = this.streamRequestHandler as any;
        }

        // The base HttpCrawler class only supports a handful of text based mime types.
        // With the FileDownload crawler, we want to download any file type.
        (this as any).supportedMimeTypes = new Set(['*/*']);
    }

    protected override async _runRequestHandler(context: FileDownloadCrawlingContext) {
        if (this.streamHandler) {
            context.request.skipNavigation = true;
        }

        await super._runRequestHandler(context);
    }

    private async streamRequestHandler(context: FileDownloadCrawlingContext) {
        const {
            log,
            request: { url },
        } = context;

        const response = await this.httpClient.stream({
            url,
            timeout: { request: undefined },
            proxyUrl: context.proxyInfo?.url,
        });

        let pollingInterval: NodeJS.Timeout | undefined;

        const cleanUp = () => {
            clearInterval(pollingInterval!);
            response.stream.destroy();
        };

        const downloadPromise = new Promise<void>((resolve, reject) => {
            pollingInterval = setInterval(() => {
                const { total, transferred } = response.downloadProgress;

                if (transferred > 0) {
                    log.debug(`Downloaded ${transferred} bytes of ${total ?? 0} bytes from ${url}.`);
                }
            }, 5000);

            response.stream.on('error', async (error: Error) => {
                cleanUp();
                reject(error);
            });

            let streamHandlerResult;

            try {
                context.stream = response.stream;
                context.response = response as any;
                streamHandlerResult = this.streamHandler!(context as any);
            } catch (e) {
                cleanUp();
                reject(e);
            }

            if (isPromise(streamHandlerResult)) {
                streamHandlerResult
                    .then(() => {
                        resolve();
                    })
                    .catch((e: Error) => {
                        cleanUp();
                        reject(e);
                    });
            } else {
                resolve();
            }
        });

        await Promise.all([downloadPromise, finished(response.stream)]);

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
