import type { BaseHttpClient } from '@crawlee/http-client';
import type { CrawleeLogger } from '@crawlee/types';
import { Sitemap } from './sitemap.js';
import { type EnqueueStrategy } from './url.js';
export interface RobotsTxtFileSitemapsOptions {
    /**
     * Keep only sitemap URLs matching this strategy relative to the robots.txt host; non-`http(s)` schemes
     * are always dropped. Pass `'all'` to disable host filtering.
     * @default 'same-hostname'
     */
    enqueueStrategy?: EnqueueStrategy | `${EnqueueStrategy}`;
}
/**
 * Loads and queries information from a [robots.txt file](https://en.wikipedia.org/wiki/Robots.txt).
 *
 * **Example usage:**
 * ```javascript
 * // Load the robots.txt file
 * const robots = await RobotsTxtFile.find('https://crawlee.dev/js/docs/introduction/first-crawler');
 *
 * // Check if a URL should be crawled according to robots.txt
 * const url = 'https://crawlee.dev/api/puppeteer-crawler/class/PuppeteerCrawler';
 * if (robots.isAllowed(url)) {
 *   await crawler.addRequests([url]);
 * }
 *
 * // Enqueue all links in the sitemap(s)
 * await crawler.addRequests(await robots.parseUrlsFromSitemaps());
 * ```
 */
export declare class RobotsTxtFile {
    #private;
    private constructor();
    /**
     * Determine the location of a robots.txt file for a URL and fetch it.
     * @param url the URL to fetch robots.txt for
     * @param [options] additional options
     * @param [options.signal] an AbortSignal to cancel the request
     * @param [options.timeoutMillis] timeout in milliseconds for the request
     * @param [options.proxyUrl] a proxy to be used for fetching the robots.txt file
     */
    static find(url: string, options?: {
        signal?: AbortSignal;
        timeoutMillis?: number;
        proxyUrl?: string;
        httpClient?: BaseHttpClient;
        logger?: CrawleeLogger;
    }): Promise<RobotsTxtFile>;
    /**
     * Allows providing the URL and robots.txt content explicitly instead of loading it from the target site.
     * @param url the URL for robots.txt file
     * @param content contents of robots.txt
     * @param [proxyUrl] a proxy to be used for fetching the robots.txt file
     */
    static from(url: string, content: string, proxyUrl?: string): RobotsTxtFile;
    private static load;
    /**
     * Get crawl delay for a given user agent.
     * @param [userAgent] relevant user agent, default to `*`
     */
    getCrawlDelay(userAgent?: string): number | undefined;
    /**
     * Check if a URL should be crawled by robots.
     * @param url the URL to check against the rules in robots.txt
     * @param [userAgent] relevant user agent, default to `*`
     */
    isAllowed(url: string, userAgent?: string): boolean;
    /**
     * Get URLs of sitemaps referenced in the robots file, filtered by `options.enqueueStrategy` relative to
     * the robots.txt host (default `'same-hostname'`; pass `'all'` to disable). Non-`http(s)` schemes are
     * always dropped.
     */
    getSitemaps(options?: RobotsTxtFileSitemapsOptions): string[];
    /**
     * Parse all the sitemaps referenced in the robots file. `options` are forwarded to `getSitemaps`
     * and the sitemap parser.
     */
    parseSitemaps(options?: RobotsTxtFileSitemapsOptions): Promise<Sitemap>;
    /**
     * Get all URLs from all the sitemaps referenced in the robots file. A shorthand for `(await robots.parseSitemaps()).urls`.
     * `options` are forwarded to `parseSitemaps`.
     */
    parseUrlsFromSitemaps(options?: RobotsTxtFileSitemapsOptions): Promise<string[]>;
}
