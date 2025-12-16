import { ImpitHttpClient } from '@crawlee/impit-client';
import type { BaseHttpClient, ISession } from '@crawlee/types';
import type { Robot } from 'robots-parser';
import robotsParser from 'robots-parser';

import { Sitemap } from './sitemap.js';

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
        private robots: Pick<Robot, 'isAllowed' | 'getSitemaps'>,
        private proxyUrl?: string,
    ) {}

    /**
     * Determine the location of a robots.txt file for a URL and fetch it.
     * @param url the URL to fetch robots.txt for
     * @param [proxyUrl] a proxy to be used for fetching the robots.txt file
     */
    static async find(
        url: string,
        options?: { proxyUrl?: string; httpClient?: BaseHttpClient },
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
        return new RobotsTxtFile(robotsParser(url, content), proxyUrl);
    }

    protected static async load(
        url: string,
        options?: { proxyUrl?: string; httpClient?: BaseHttpClient },
    ): Promise<RobotsTxtFile> {
        const { proxyUrl, httpClient = new ImpitHttpClient() } = options || {};

        const response = await httpClient.sendRequest(
            new Request(url, { method: 'GET' }),
            proxyUrl
                ? {
                      session: {
                          proxyInfo: {
                              url: proxyUrl,
                          },
                      } as ISession,
                  }
                : {},
        );

        if (response.status === 404) {
            return new RobotsTxtFile(
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

        // @ts-ignore
        return new RobotsTxtFile(robotsParser(url.toString(), response.body), proxyUrl);
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

// to stay backwards compatible
export { RobotsTxtFile as RobotsFile };
