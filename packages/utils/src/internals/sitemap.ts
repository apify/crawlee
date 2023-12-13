import log from '@apify/log';
import sax from 'sax';

import { gotScraping } from './gotScraping';

export class Sitemap {
    constructor(readonly urls: string[]) {}

    /**
     * Fetch sitemap content from given URL or URLs and return URLs of referenced pages.
     * @param urls sitemap URL(s)
     * @param proxyUrl URL of a proxy to be used for fetching sitemap contents
     */
    static async load(urls: string | string[], proxyUrl?: string): Promise<Sitemap> {
        const parsingState: {
            context: 'sitemapindex' | 'urlset' | undefined;
            loc: boolean;
            urls: string[];
            sitemapUrls: string[];
            visitedSitemapUrls: string[];
        } = { context: undefined, loc: false, urls: [], sitemapUrls: Array.isArray(urls) ? urls : [urls], visitedSitemapUrls: [] };

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
                    log.warning(`Malformed sitemap content: ${sitemapUrl}`);
                }
            }
        }

        return new Sitemap(parsingState.urls);
    }
}
