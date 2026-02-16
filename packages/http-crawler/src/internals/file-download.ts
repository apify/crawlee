import { Transform } from 'node:stream';

import type { BasicCrawlerOptions } from '@crawlee/basic';
import { BasicCrawler, ContextPipeline } from '@crawlee/basic';
import type { CrawlingContext, LoadedRequest, Request } from '@crawlee/core';
import { ResponseWithUrl } from '@crawlee/http-client';
import type { Dictionary } from '@crawlee/types';

import type { ErrorHandler, GetUserDataFromRequest, InternalHttpHook, RequestHandler, RouterRoutes } from '../index.js';
import { Router } from '../index.js';
import { parseContentTypeFromResponse } from './utils.js';

const kBodyDrained = Symbol('bodyDrained');

export type FileDownloadErrorHandler<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = ErrorHandler<FileDownloadCrawlingContext<UserData>>;

export type FileDownloadHook<
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = InternalHttpHook<FileDownloadCrawlingContext<UserData>>;

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
export class FileDownload extends BasicCrawler<FileDownloadCrawlingContext> {
    // TODO hooks
    constructor(options: BasicCrawlerOptions<FileDownloadCrawlingContext> = {}) {
        super({
            ...options,
            contextPipelineBuilder: () =>
                ContextPipeline.create<CrawlingContext>().compose({
                    action: async (context) => this.initiateDownload(context),
                    cleanup: async (context) => {
                        if (!context.response.bodyUsed) {
                            // Nobody consumed the body — cancel it so the
                            // underlying connection can be released.
                            await context.response.body?.cancel();
                        }

                        await (context as { [kBodyDrained]: Promise<void> })[kBodyDrained];
                    },
                }),
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
    UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
>(routes?: RouterRoutes<Context, UserData>) {
    return Router.create<Context>(routes);
}
