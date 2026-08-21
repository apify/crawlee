import { FetchHttpClient } from '@crawlee/http-client';
import type { BaseHttpClient } from '@crawlee/http-client';
import type { CrawleeLogger } from '@crawlee/types';
import type { Robot } from 'robots-parser';
import robotsParser from 'robots-parser';

import { Sitemap } from './sitemap.js';
import { type EnqueueStrategy, filterUrl } from './url.js';

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
export class RobotsTxtFile {
    #url: string;
    #robots: Pick<Robot, 'isAllowed' | 'getSitemaps' | 'getCrawlDelay'>;
    #proxyUrl?: string;
    #logger?: CrawleeLogger;

    private constructor(
        url: string,
        robots: Pick<Robot, 'isAllowed' | 'getSitemaps' | 'getCrawlDelay'>,
        proxyUrl?: string,
        logger?: CrawleeLogger,
    ) {
        this.#url = url;
        this.#robots = robots;
        this.#proxyUrl = proxyUrl;
        this.#logger = logger;
    }

    /**
     * Determine the location of a robots.txt file for a URL and fetch it.
     * @param url the URL to fetch robots.txt for
     * @param [options] additional options
     * @param [options.signal] an AbortSignal to cancel the request
     * @param [options.timeoutMillis] timeout in milliseconds for the request
     * @param [options.proxyUrl] a proxy to be used for fetching the robots.txt file
     */
    static async find(
        url: string,
        options?: {
            signal?: AbortSignal;
            timeoutMillis?: number;
            proxyUrl?: string;
            httpClient?: BaseHttpClient;
            logger?: CrawleeLogger;
        },
    ): Promise<RobotsTxtFile> {
        const robotsTxtFileUrl = new URL(url);
        robotsTxtFileUrl.pathname = '/robots.txt';
        robotsTxtFileUrl.search = '';

        return RobotsTxtFile.load(robotsTxtFileUrl.toString(), options);
    }

    /**
     * Allows providing the URL and robots.txt content explicitly instead of loading it from the target site.
     * @param url the URL for robots.txt file
     * @param content contents of robots.txt
     * @param [proxyUrl] a proxy to be used for fetching the robots.txt file
     */
    static from(url: string, content: string, proxyUrl?: string): RobotsTxtFile {
        // @ts-ignore
        return new RobotsTxtFile(url, robotsParser(url, content), proxyUrl);
    }

    private static async load(
        url: string,
        options?: {
            signal?: AbortSignal;
            timeoutMillis?: number;
            proxyUrl?: string;
            httpClient?: BaseHttpClient;
            logger?: CrawleeLogger;
        },
    ): Promise<RobotsTxtFile> {
        const { proxyUrl, logger, httpClient = new FetchHttpClient() } = options || {};

        const response = await httpClient.sendRequest(new Request(url, { method: 'GET' }), {
            proxyUrl,
            timeoutMillis: options?.timeoutMillis,
            signal: options?.signal,
        });

        if (response.status < 200 || response.status >= 300) {
            throw new Error(`Failed to load robots.txt from ${url}: HTTP ${response.status}`);
        }

        if (response.status === 404) {
            return new RobotsTxtFile(
                url,
                {
                    isAllowed() {
                        return true;
                    },
                    getSitemaps() {
                        return [];
                    },
                    getCrawlDelay() {
                        return undefined;
                    },
                },
                proxyUrl,
                logger,
            );
        }

        // @ts-ignore
        return new RobotsTxtFile(url, robotsParser(url.toString(), await response.text()), proxyUrl, logger);
    }

    /**
     * Get crawl delay for a given user agent.
     * @param [userAgent] relevant user agent, default to `*`
     */
    getCrawlDelay(userAgent = '*'): number | undefined {
        return this.#robots.getCrawlDelay(userAgent);
    }

    /**
     * Check if a URL should be crawled by robots.
     * @param url the URL to check against the rules in robots.txt
     * @param [userAgent] relevant user agent, default to `*`
     */
    isAllowed(url: string, userAgent = '*'): boolean {
        return this.#robots.isAllowed(url, userAgent) ?? true; // `undefined` means that there is no explicit rule for the requested URL - assume it's allowed
    }

    /**
     * Get URLs of sitemaps referenced in the robots file, filtered by `options.enqueueStrategy` relative to
     * the robots.txt host (default `'same-hostname'`; pass `'all'` to disable). Non-`http(s)` schemes are
     * always dropped.
     */
    getSitemaps(options: RobotsTxtFileSitemapsOptions = {}): string[] {
        const { enqueueStrategy = 'same-hostname' } = options;
        const sitemaps: string[] = [];

        for (const sitemapUrl of this.#robots.getSitemaps()) {
            // `filterUrl` tolerates an unparseable origin (returns not-allowed) rather than throwing.
            const { allowed, reason } = filterUrl(sitemapUrl, this.#url, enqueueStrategy);
            if (!allowed) {
                this.#logger?.warning(
                    `Skipping sitemap ${sitemapUrl} listed in robots.txt at ${this.#url}: ${reason}.`,
                );
                continue;
            }
            sitemaps.push(sitemapUrl);
        }

        return sitemaps;
    }

    /**
     * Parse all the sitemaps referenced in the robots file. `options` are forwarded to `getSitemaps`
     * and the sitemap parser.
     */
    async parseSitemaps(options: RobotsTxtFileSitemapsOptions = {}): Promise<Sitemap> {
        return Sitemap.load(this.getSitemaps(options), this.#proxyUrl, { ...options, logger: this.#logger });
    }

    /**
     * Get all URLs from all the sitemaps referenced in the robots file. A shorthand for `(await robots.parseSitemaps()).urls`.
     * `options` are forwarded to `parseSitemaps`.
     */
    async parseUrlsFromSitemaps(options: RobotsTxtFileSitemapsOptions = {}): Promise<string[]> {
        return (await this.parseSitemaps(options)).urls;
    }
}
