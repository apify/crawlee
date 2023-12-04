// @ts-expect-error This throws a compilation error due to got-scraping being ESM only but we only import types, so its alllll gooooood
import type { HTTPError as HTTPErrorClass } from 'got';
import type { Robot } from 'robots-parser';
import robotsParser from 'robots-parser';

import { downloadListOfUrls } from './extract-urls';
import { gotScraping } from './gotScraping';

let HTTPError: typeof HTTPErrorClass;

export class RobotsFile {
    constructor(private robots: Pick<Robot, 'isAllowed' | 'getSitemaps'>, private proxyUrl?: string) {}

    public static async find(url: string, proxyUrl?: string): Promise<RobotsFile> {
        const robotsFileUrl = new URL(url);
        robotsFileUrl.pathname = '/robots.txt';
        robotsFileUrl.search = '';

        return RobotsFile.load(robotsFileUrl.toString(), proxyUrl);
    }

    protected static async load(url: string, proxyUrl?: string): Promise<RobotsFile> {
        if (!HTTPError) {
            HTTPError = (await import('got')).HTTPError;
        }

        try {
            const response = await gotScraping({
                url,
                method: 'GET',
                responseType: 'text',
                proxyUrl,
            });

            return new RobotsFile(robotsParser(url.toString(), response.body), proxyUrl);
        } catch (e) {
            if (e instanceof HTTPError && e.response.statusCode === 404) {
                return new RobotsFile({ isAllowed() { return true; }, getSitemaps() { return []; } }, proxyUrl);
            }
            throw e;
        }
    }

    public isAllowed(url: string): boolean {
        return this.robots.isAllowed(url, '*') ?? false;
    }

    public getSitemaps(): string[] {
        return this.robots.getSitemaps();
    }

    public async parseSitemaps(): Promise<Sitemap[]> {
        return Promise.all(this.robots.getSitemaps().map(async (sitemap) => Sitemap.load(sitemap, this.proxyUrl)));
    }

    public async parseUrlsFromSitemaps(): Promise<string[]> {
        return (await this.parseSitemaps()).flatMap((sitemap) => sitemap.urls);
    }
}

export class Sitemap {
    constructor(public readonly urls: string[]) {}

    static async load(url: string, proxyUrl?: string): Promise<Sitemap> {
        const urls = await downloadListOfUrls({ url, proxyUrl });
        return new Sitemap(urls.filter((it) => new URL(it).host !== 'www.sitemaps.org'));
    }
}
