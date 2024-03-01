// @ts-expect-error This throws a compilation error due to got-scraping being ESM only but we only import types, so its alllll gooooood
import type { HTTPError as HTTPErrorClass } from 'got-scraping';
import type { Robot } from 'robots-parser';
import robotsParser from 'robots-parser';

import { gotScraping } from './gotScraping';
import { Sitemap } from './sitemap';

let HTTPError: typeof HTTPErrorClass;

/**
 * Loads and queries information from a [robots.txt file](https://en.wikipedia.org/wiki/Robots.txt).
 *
 * **Example usage:**
 * ```javascript
 * // Load the robots.txt file
 * const robots = await RobotsFile.load('https://crawlee.dev/docs/introduction/first-crawler');
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
export class RobotsFile {
    private constructor(
        private robots: Pick<Robot, 'isAllowed' | 'getSitemaps'>,
        private proxyUrl?: string,
    ) {}

    /**
     * Determine the location of a robots.txt file for a URL and fetch it.
     * @param url the URL to fetch robots.txt for
     * @param [proxyUrl] a proxy to be used for fetching the robots.txt file
     */
    static async find(url: string, proxyUrl?: string): Promise<RobotsFile> {
        const robotsFileUrl = new URL(url);
        robotsFileUrl.pathname = '/robots.txt';
        robotsFileUrl.search = '';

        return RobotsFile.load(robotsFileUrl.toString(), proxyUrl);
    }

    /**
     * Allows providing the URL and robotx.txt content explicitly instead of loading it from the target site.
     * @param url the URL for robots.txt file
     * @param content contents of robots.txt
     * @param [proxyUrl] a proxy to be used for fetching the robots.txt file
     */
    static from(url: string, content: string, proxyUrl?: string): RobotsFile {
        return new RobotsFile(robotsParser(url, content), proxyUrl);
    }

    protected static async load(url: string, proxyUrl?: string): Promise<RobotsFile> {
        if (!HTTPError) {
            HTTPError = (await import('got-scraping')).HTTPError;
        }

        try {
            const response = await gotScraping({
                url,
                proxyUrl,
                method: 'GET',
                responseType: 'text',
            });

            return new RobotsFile(robotsParser(url.toString(), response.body), proxyUrl);
        } catch (e) {
            if (e instanceof HTTPError && e.response.statusCode === 404) {
                return new RobotsFile(
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
        return this.robots.isAllowed(url, userAgent) ?? false;
    }

    /**
     * Get URLs of sitemaps referenced in the robots file.
     */
    getSitemaps(): string[] {
        return this.robots.getSitemaps();
    }

    /**
     * Parse all the sitemaps referenced in the robots file.
     */
    async parseSitemaps(): Promise<Sitemap> {
        return Sitemap.load(this.robots.getSitemaps(), this.proxyUrl);
    }

    /**
     * Get all URLs from all the sitemaps referenced in the robots file. A shorthand for `(await robots.parseSitemaps()).urls`.
     */
    async parseUrlsFromSitemaps(): Promise<string[]> {
        return (await this.parseSitemaps()).urls;
    }
}
