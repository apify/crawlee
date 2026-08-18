import type { BaseHttpClient } from '@crawlee/http-client';
import type { CrawleeLogger } from '@crawlee/types';
import { type EnqueueStrategy } from './url.js';
interface SitemapUrlData {
    loc: string;
    lastmod?: Date;
    changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
    priority?: number;
}
export type SitemapUrl = SitemapUrlData & {
    originSitemapUrl: string;
};
interface NestedSitemap {
    loc: string;
    originSitemapUrl: null;
}
type SitemapSource = ({
    type: 'url';
    url: string;
} | {
    type: 'raw';
    content: string;
}) & {
    depth?: number;
};
export interface ParseSitemapOptions {
    /**
     * If set to `true`, elements referring to other sitemaps will be emitted as special objects with `originSitemapUrl` set to `null`.
     */
    emitNestedSitemaps?: true | false;
    /**
     * Maximum depth of nested sitemaps to follow.
     */
    maxDepth?: number;
    /**
     * Number of retries for fetching sitemaps. The counter resets for each nested sitemap.
     */
    sitemapRetries?: number;
    /**
     * Timeout settings for network requests when fetching sitemaps. By default this is `30000` milliseconds (30 seconds).
     */
    timeoutMillis?: number;
    /**
     * If true, the parser will log a warning if it fails to fetch a sitemap due to a network error
     * @default true
     */
    reportNetworkErrors?: boolean;
    /**
     * Custom HTTP client to be used for fetching sitemaps.
     */
    httpClient?: BaseHttpClient;
    /**
     * Optional filter for nested sitemap URLs discovered in sitemap index files.
     * Called with the URL of each child sitemap before it is fetched.
     * Return `true` to include the sitemap, `false` to skip it.
     * If not provided, all nested sitemaps are followed.
     */
    nestedSitemapFilter?: (sitemapUrl: string) => boolean;
    /**
     * Keep only sitemap-derived URLs (nested `<sitemap>` and `<url>` entries) matching this strategy
     * relative to the parent sitemap URL; non-`http(s)` schemes are always dropped. Skipped for raw string
     * sources (no parent URL). Pass `'all'` to disable host filtering.
     * @default 'same-hostname'
     */
    enqueueStrategy?: EnqueueStrategy | `${EnqueueStrategy}`;
    /**
     * Optional logger for reporting warnings during sitemap parsing.
     */
    logger?: CrawleeLogger;
}
export declare function parseSitemap<T extends ParseSitemapOptions>(initialSources: SitemapSource[], proxyUrl?: string, options?: T): AsyncIterable<T['emitNestedSitemaps'] extends true ? SitemapUrl | NestedSitemap : SitemapUrl>;
/**
 * Loads one or more sitemaps from given URLs, following references in sitemap index files, and exposes the contained URLs.
 *
 * **Example usage:**
 * ```javascript
 * // Load a sitemap
 * const sitemap = await Sitemap.load(['https://example.com/sitemap.xml', 'https://example.com/sitemap_2.xml.gz']);
 *
 * // Enqueue all the contained URLs (including those from sub-sitemaps from sitemap indexes)
 * await crawler.addRequests(sitemap.urls);
 * ```
 */
export declare class Sitemap {
    readonly urls: string[];
    constructor(urls: string[]);
    /**
     * Try to load sitemap from the most common locations - `/sitemap.xml` and `/sitemap.txt`.
     * For loading based on `Sitemap` entries in `robots.txt`, the {@apilink RobotsTxtFile} class should be used.
     * @param url The domain URL to fetch the sitemap for.
     * @param proxyUrl A proxy to be used for fetching the sitemap file.
     */
    static tryCommonNames(url: string, proxyUrl?: string, parseSitemapOptions?: ParseSitemapOptions): Promise<Sitemap>;
    /**
     * Fetch sitemap content from given URL or URLs and return URLs of referenced pages.
     * @param urls sitemap URL(s)
     * @param proxyUrl URL of a proxy to be used for fetching sitemap contents
     */
    static load(urls: string | string[], proxyUrl?: string, parseSitemapOptions?: ParseSitemapOptions): Promise<Sitemap>;
    /**
     * Parse XML sitemap content from a string and return URLs of referenced pages. If the sitemap references other sitemaps, they will be loaded via HTTP.
     * @param content XML sitemap content
     * @param proxyUrl URL of a proxy to be used for fetching sitemap contents
     */
    static fromXmlString(content: string, proxyUrl?: string, parseSitemapOptions?: ParseSitemapOptions): Promise<Sitemap>;
    private static parse;
}
/**
 * Given a list of URLs, discover related sitemap files for these domains by checking the `robots.txt` file,
 * the default `sitemap.xml` & `sitemap.txt` files and the URLs themselves.
 * @param `urls` The list of URLs to discover sitemaps for.
 * @param `options` Options for sitemap discovery
 * @returns An async iterable with the discovered sitemap URLs.
 */
export declare function discoverValidSitemaps(urls: string[], options?: {
    /**
     * Proxy URL to be used for network requests.
     */
    proxyUrl?: string;
    /**
     * Timeout in milliseconds for the entire `discoverValidSitemaps` call.
     * An `AbortController` is created internally and its signal is passed to every HTTP request,
     * so the whole discovery operation is cancelled once the timeout elapses.
     * Defaults to `60_000` ms (60 seconds) to prevent indefinite hangs.
     */
    timeoutMillis?: number;
    /**
     * An external `AbortSignal` to cancel the entire discovery operation.
     * If both `signal` and `timeout` are provided, the operation is cancelled
     * when either the signal is aborted or the timeout elapses (whichever comes first).
     */
    signal?: AbortSignal;
    /**
     * Timeout in milliseconds for each individual HTTP request during discovery.
     * Defaults to `20000` ms (20 seconds).
     */
    requestTimeoutMillis?: number;
    /**
     * HTTP client to be used for network requests.
     */
    httpClient?: BaseHttpClient;
    /**
     * Optional logger for reporting warnings during sitemap discovery.
     */
    logger?: CrawleeLogger;
}): AsyncIterable<string>;
export {};
