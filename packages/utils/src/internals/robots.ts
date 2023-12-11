// @ts-expect-error This throws a compilation error due to got-scraping being ESM only but we only import types, so its alllll gooooood
import type { HTTPError as HTTPErrorClass } from 'got-scraping';
import type { Robot } from 'robots-parser';
import robotsParser from 'robots-parser';

import { gotScraping } from './gotScraping';
import { Sitemap } from './sitemap';

let HTTPError: typeof HTTPErrorClass;

export class RobotsFile {
    private constructor(
        private robots: Pick<Robot, 'isAllowed' | 'getSitemaps'>,
        private proxyUrl?: string,
    ) {}

    static async find(url: string, proxyUrl?: string): Promise<RobotsFile> {
        const robotsFileUrl = new URL(url);
        robotsFileUrl.pathname = '/robots.txt';
        robotsFileUrl.search = '';

        return RobotsFile.load(robotsFileUrl.toString(), proxyUrl);
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
                return new RobotsFile({ isAllowed() { return true; }, getSitemaps() { return []; } }, proxyUrl);
            }
            throw e;
        }
    }

    isAllowed(url: string): boolean {
        return this.robots.isAllowed(url, '*') ?? false;
    }

    getSitemaps(): string[] {
        return this.robots.getSitemaps();
    }

    async parseSitemaps(): Promise<Sitemap> {
        return Sitemap.load(this.robots.getSitemaps(), this.proxyUrl);
    }

    async parseUrlsFromSitemaps(): Promise<string[]> {
        return (await this.parseSitemaps()).urls;
    }
}
