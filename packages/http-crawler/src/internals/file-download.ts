import type { BasicCrawlerOptions } from '@crawlee/basic';
import { BasicCrawler, ContextPipeline } from '@crawlee/basic';
import type { CrawlingContext, LoadedRequest, Request } from '@crawlee/core';
import type { Dictionary } from '@crawlee/types';

import type { ErrorHandler, GetUserDataFromRequest, InternalHttpHook, RequestHandler, RouterRoutes } from '../index.js';
import { Router } from '../index.js';
import { parseContentTypeFromResponse } from './utils.js';

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
export class FileDownload extends BasicCrawler<FileDownloadCrawlingContext> {
    // TODO hooks
    constructor(options: BasicCrawlerOptions<FileDownloadCrawlingContext> = {}) {
        super({
            ...options,
            contextPipelineBuilder: () =>
                ContextPipeline.create<CrawlingContext>().compose({
                    action: this.initiateDownload.bind(this),
                }),
        });
    }

    private async initiateDownload(context: CrawlingContext) {
        const response = await this.httpClient.stream({
            url: context.request.url,
            timeout: { request: undefined },
            proxyUrl: context.proxyInfo?.url,
        });

        const { type, charset: encoding } = parseContentTypeFromResponse(response);

        context.request.url = response.url;

        const contextExtension = {
            request: context.request as LoadedRequest<Request>,
            response,
            contentType: { type, encoding },
        };

        return contextExtension;
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
