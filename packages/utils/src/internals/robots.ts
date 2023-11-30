import { downloadListOfUrls, gotScraping } from '@crawlee/utils';
import { HTTPError } from 'got';
import type { Robot } from 'robots-parser';
import robotsParser from 'robots-parser';

export class RobotsFile {
    constructor(private robots: Pick<Robot, 'isAllowed' | 'getSitemaps'>, private proxyUrl?: string) {}

    public static async find(url: string, proxyUrl?: string): Promise<RobotsFile> {
        const robotsFileUrl = new URL(url);
        robotsFileUrl.pathname = '/robots.txt';
        robotsFileUrl.search = '';

        return RobotsFile.load(robotsFileUrl.toString(), proxyUrl);
    }

    protected static async load(url: string, proxyUrl?: string): Promise<RobotsFile> {
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
        return new Sitemap(await downloadListOfUrls({ url, proxyUrl }));
    }
}
