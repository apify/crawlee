// @ts-expect-error This throws a compilation error due to got-scraping being ESM only but we only import types, so its alllll gooooood
import { log } from 'crawlee';
import type { HTTPError as HTTPErrorClass } from 'got';
import type { Robot } from 'robots-parser';
import robotsParser from 'robots-parser';
import sax from 'sax';

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
        const parsingState: {
            context: 'sitemapindex' | 'urlset' | undefined;
            loc: boolean;
            urls: string[];
            sitemapUrls: string[];
            visitedSitemapUrls: string[];
        } = { context: undefined, loc: false, urls: [], sitemapUrls: [url], visitedSitemapUrls: [] };

        while (parsingState.sitemapUrls.length > 0) {
            const sitemapUrl = parsingState.sitemapUrls.pop()!;
            parsingState.visitedSitemapUrls.push(sitemapUrl);

            const response = await gotScraping({ url: sitemapUrl, proxyUrl, responseType: 'text', method: 'GET' });
            const parser = sax.parser(true);

            parser.onopentag = (node) => {
                if (node.name === 'loc' && parsingState.context !== undefined) {
                    parsingState.loc = true;
                }
                if (node.name === 'urlset') {
                    parsingState.context = 'urlset';
                }
                if (node.name === 'sitemapindex') {
                    parsingState.context = 'sitemapindex';
                }
            };

            parser.onclosetag = (name) => {
                if (name === 'loc') {
                    parsingState.loc = false;
                }
            };

            parser.ontext = (text) => {
                if (parsingState.loc) {
                    if (parsingState.context === 'sitemapindex') {
                        if (!parsingState.visitedSitemapUrls.includes(text)) {
                            parsingState.sitemapUrls.push(text);
                        }
                    }
                    if (parsingState.context === 'urlset') {
                        parsingState.urls.push(text);
                    }
                }
            };

            if (response.statusCode === 200) {
                try {
                    parser.write(response.body).close();
                } catch (e) {
                    log.warning(`Malformed sitemap content: ${url}`);
                }
            }
        }

        return new Sitemap(parsingState.urls);
    }
}
