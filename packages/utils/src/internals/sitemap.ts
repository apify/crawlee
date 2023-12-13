import log from '@apify/log';
import type { SAXStream } from 'sax';
import sax from 'sax';

class ParsingState {
    sitemapUrls: string[] = [];
    urls: string[] = [];
    visitedSitemapUrls: string[] = [];
    context: 'sitemapindex' | 'urlset' | undefined = undefined;
    loc: boolean = false;

    resetContext() {
        this.context = undefined;
        this.loc = false;
    }
}

export class Sitemap {
    constructor(readonly urls: string[]) {}

    protected static createParser(parsingState: ParsingState, onEnd: () => void, onError: (error: Error) => void): SAXStream {
        const parser = sax.createStream(true);

        parser.on('opentag', (node) => {
            if (node.name === 'loc' && parsingState.context !== undefined) {
                parsingState.loc = true;
            }
            if (node.name === 'urlset') {
                parsingState.context = 'urlset';
            }
            if (node.name === 'sitemapindex') {
                parsingState.context = 'sitemapindex';
            }
        });

        parser.on('closetag', (name) => {
            if (name === 'loc') {
                parsingState.loc = false;
            }
        });

        parser.on('text', (text) => {
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
        });

        parser.on('end', onEnd);
        parser.on('error', onError);

        return parser;
    }

    /**
     * Fetch sitemap content from given URL or URLs and return URLs of referenced pages.
     * @param urls sitemap URL(s)
     * @param proxyUrl URL of a proxy to be used for fetching sitemap contents
     */
    static async load(urls: string | string[], proxyUrl?: string): Promise<Sitemap> {
        const { gotScraping } = await import('got-scraping');

        const parsingState = new ParsingState();
        parsingState.sitemapUrls = Array.isArray(urls) ? urls : [urls];

        while (parsingState.sitemapUrls.length > 0) {
            const sitemapUrl = parsingState.sitemapUrls.pop()!;
            parsingState.visitedSitemapUrls.push(sitemapUrl);
            parsingState.resetContext();

            try {
                const sitemapStream = await new Promise<ReturnType<typeof gotScraping.stream>>((resolve, reject) => {
                    const request = gotScraping.stream({ url: sitemapUrl, proxyUrl, method: 'GET' });
                    request.on('response', () => resolve(request));
                    request.on('error', reject);
                });

                if (sitemapStream.response!.statusCode === 200) {
                    await new Promise((resolve, reject) => {
                        const parser = Sitemap.createParser(parsingState, () => resolve(undefined), reject);
                        sitemapStream.pipe(parser);
                    });
                }
            } catch (e) {
                log.warning(`Malformed sitemap content: ${sitemapUrl}`);
            }
        }

        return new Sitemap(parsingState.urls);
    }
}
