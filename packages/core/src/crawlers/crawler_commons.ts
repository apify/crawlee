import type { Dictionary, BatchAddRequestsResult } from '@crawlee/types';
import type { Response as GotResponse, OptionsInit } from 'got-scraping';

import type { EnqueueLinksOptions } from '../enqueue_links/enqueue_links';
import type { Log } from '../log';
import type { ProxyInfo } from '../proxy_configuration';
import type { Request } from '../request';
import type { Session } from '../session_pool/session';

// eslint-disable-next-line @typescript-eslint/ban-types
export interface CrawlingContext<Crawler = unknown, UserData extends Dictionary = Dictionary> extends Record<string & {}, unknown> {
    id: string;
    /**
     * The original {@apilink Request} object.
     */
    request: Request<UserData>;
    session?: Session;

    /**
     * An object with information about currently used proxy by the crawler
     * and configured by the {@apilink ProxyConfiguration} class.
     */
    proxyInfo?: ProxyInfo;
    log: Log;
    crawler: Crawler;

    /**
     * This function automatically finds and enqueues links from the current page, adding them to the {@apilink RequestQueue}
     * currently used by the crawler.
     *
     * Optionally, the function allows you to filter the target links' URLs using an array of globs or regular expressions
     * and override settings of the enqueued {@apilink Request} objects.
     *
     * Check out the [Crawl a website with relative links](https://crawlee.dev/docs/examples/crawl-relative-links) example
     * for more details regarding its usage.
     *
     * **Example usage**
     *
     * ```ts
     * async requestHandler({ enqueueLinks }) {
     *     await enqueueLinks({
     *       globs: [
     *           'https://www.example.com/handbags/*',
     *       ],
     *     });
     * },
     * ```
     *
     * @param [options] All `enqueueLinks()` parameters are passed via an options object.
     * @returns Promise that resolves to {@apilink BatchAddRequestsResult} object.
     */
    enqueueLinks(options?: EnqueueLinksOptions): Promise<BatchAddRequestsResult>;

    /**
     * Fires HTTP request via [`got-scraping`](https://crawlee.dev/docs/guides/got-scraping), allowing to override the request
     * options on the fly.
     *
     * This is handy when you work with a browser crawler but want to execute some requests outside it (e.g. API requests).
     * Check the [Skipping navigations for certain requests](https://crawlee.dev/docs/examples/skip-navigation) example for
     * more detailed explanation of how to do that.
     *
     * ```ts
     * async requestHandler({ sendRequest }) {
     *     const { body } = await sendRequest({
     *         // override headers only
     *         headers: { ... },
     *     });
     * },
     * ```
     */
    sendRequest<Response = string>(overrideOptions?: Partial<OptionsInit>): Promise<GotResponse<Response>>;
}
