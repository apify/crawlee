// @ts-expect-error This throws a compilation error due to got-scraping being ESM only but we only import types, so its alllll gooooood
import type { HTTPError as HTTPErrorClass } from 'got-scraping';
import type { Robot } from 'robots-parser';
import robotsParser from 'robots-parser';

import log from '@apify/log';

import { gotScraping } from './gotScraping';
import { Sitemap } from './sitemap';
import { type EnqueueStrategy, filterUrl } from './url';

let HTTPError: typeof HTTPErrorClass;

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
    private constructor(
        private url: string,
        private robots: Pick<Robot, 'isAllowed' | 'getSitemaps'>,
        private proxyUrl?: string,
    ) {}

    /**
     * Determine the location of a robots.txt file for a URL and fetch it.
     * @param url the URL to fetch robots.txt for
     * @param [proxyUrl] a proxy to be used for fetching the robots.txt file
     * @param [options] additional options
     * @param [options.signal] an AbortSignal to cancel the request
     * @param [options.timeoutMillis] timeout in milliseconds for the request
     */
    static async find(
        url: string,
        proxyUrl?: string,
        options?: { signal?: AbortSignal; timeoutMillis?: number },
    ): Promise<RobotsTxtFile> {
        const robotsTxtFileUrl = new URL(url);
        robotsTxtFileUrl.pathname = '/robots.txt';
        robotsTxtFileUrl.search = '';

        return RobotsTxtFile.load(robotsTxtFileUrl.toString(), proxyUrl, options);
    }

    /**
     * Allows providing the URL and robots.txt content explicitly instead of loading it from the target site.
     * @param url the URL for robots.txt file
     * @param content contents of robots.txt
     * @param [proxyUrl] a proxy to be used for fetching the robots.txt file
     */
    static from(url: string, content: string, proxyUrl?: string): RobotsTxtFile {
        return new RobotsTxtFile(url, robotsParser(url, content), proxyUrl);
    }

    protected static async load(
        url: string,
        proxyUrl?: string,
        options?: { signal?: AbortSignal; timeoutMillis?: number },
    ): Promise<RobotsTxtFile> {
        if (!HTTPError) {
            HTTPError = (await import('got-scraping')).HTTPError;
        }

        try {
            const response = await gotScraping({
                url,
                proxyUrl,
                method: 'GET',
                responseType: 'text',
                signal: options?.signal,
                ...(options?.timeoutMillis ? { timeout: { request: options.timeoutMillis } } : {}),
            });

            return new RobotsTxtFile(url, robotsParser(url.toString(), response.body), proxyUrl);
        } catch (e) {
            if (e instanceof HTTPError && e.response.statusCode === 404) {
                return new RobotsTxtFile(
                    url,
                    {
                        isAllowed() {
                            return true;
                        },
                        getSitemaps() {
                            return [];
                        },
                    },
                    proxyUrl,
                );
            }
            throw e;
        }
    }

    /**
     * Check if a URL should be crawled by robots.
     * @param url the URL to check against the rules in robots.txt
     * @param [userAgent] relevant user agent, default to `*`
     */
    isAllowed(url: string, userAgent = '*'): boolean {
        return this.robots.isAllowed(url, userAgent) ?? true; // `undefined` means that there is no explicit rule for the requested URL - assume it's allowed
    }

    /**
     * Get URLs of sitemaps referenced in the robots file, filtered by `options.enqueueStrategy` relative to
     * the robots.txt host (default `'same-hostname'`; pass `'all'` to disable). Non-`http(s)` schemes are
     * always dropped.
     */
    getSitemaps(options: RobotsTxtFileSitemapsOptions = {}): string[] {
        const { enqueueStrategy = 'same-hostname' } = options;
        const sitemaps: string[] = [];

        for (const sitemapUrl of this.robots.getSitemaps()) {
            // `filterUrl` tolerates an unparseable origin (returns not-allowed) rather than throwing.
            const { allowed, reason } = filterUrl(sitemapUrl, this.url, enqueueStrategy);
            if (!allowed) {
                log.warning(`Skipping sitemap ${sitemapUrl} listed in robots.txt at ${this.url}: ${reason}.`);
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
        return Sitemap.load(this.getSitemaps(options), this.proxyUrl, options);
    }

    /**
     * Get all URLs from all the sitemaps referenced in the robots file. A shorthand for `(await robots.parseSitemaps()).urls`.
     * `options` are forwarded to `parseSitemaps`.
     */
    async parseUrlsFromSitemaps(options: RobotsTxtFileSitemapsOptions = {}): Promise<string[]> {
        return (await this.parseSitemaps(options)).urls;
    }
}

// to stay backwards compatible
export { RobotsTxtFile as RobotsFile };
