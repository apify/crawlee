import { Duplex, PassThrough, Readable, Transform, pipeline } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip } from 'node:zlib';

import log from '@apify/log';
import sax from 'sax';
import MIMEType from 'whatwg-mimetype';

type SitemapUrl = {
    url: string;
    lastmod?: Date;
    changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
    priority?: number;
};
type SitemapSource = ({ type: 'url' } & SitemapUrl) | { type: 'raw'; content: string };
type SitemapItem = { type: 'url'; url: string } | { type: 'sitemapUrl'; url: string };

class SitemapTxtParser extends Transform {
    private decoder: StringDecoder = new StringDecoder('utf8');
    private buffer: string = '';

    constructor() {
        super({
            readableObjectMode: true,
            transform: (chunk, _encoding, callback) => {
                this.processBuffer(this.decoder.write(chunk), false);
                callback();
            },
            flush: (callback) => {
                this.processBuffer(this.decoder.end(), true);
                callback();
            },
        });
    }

    private processBuffer(input: string, finalize: boolean): void {
        this.buffer += input;

        if (finalize || this.buffer.includes('\n')) {
            const parts = this.buffer
                .split('\n')
                .map((part) => part.trim())
                .filter((part) => part.length > 0);

            if (finalize) {
                for (const url of parts) {
                    this.push({ type: 'url', url } satisfies SitemapItem);
                }

                this.buffer = '';
            } else if (parts.length > 0) {
                for (const url of parts.slice(0, -1)) {
                    this.push({ type: 'url', url } satisfies SitemapItem);
                }

                this.buffer = parts.at(-1)!;
            }
        }
    }
}

class SitemapXmlParser extends Transform {
    private decoder: StringDecoder = new StringDecoder('utf8');
    private parser = new sax.SAXParser(true);

    private rootTagName?: 'sitemapindex' | 'urlset';
    private currentTag?: 'loc' | 'lastmod' | 'changefreq' | 'priority' = undefined;
    private url: Partial<SitemapUrl> = {};

    constructor() {
        super({
            readableObjectMode: true,
            transform: (chunk, _encoding, callback) => {
                this.parser.write(this.decoder.write(chunk));
                callback();
            },
            flush: (callback) => {
                const rest = this.decoder.end();
                if (rest.length > 0) {
                    this.parser.write(rest);
                }

                this.parser.end();
                callback();
            },
        });

        this.parser.onopentag = this.onOpenTag.bind(this);
        this.parser.onclosetag = this.onCloseTag.bind(this);

        this.parser.ontext = this.onText.bind(this);
        this.parser.oncdata = this.onText.bind(this);

        this.parser.onerror = this.destroy.bind(this);
    }

    private onOpenTag(node: sax.Tag | sax.QualifiedTag) {
        if (this.rootTagName !== undefined) {
            if (
                node.name === 'loc' ||
                node.name === 'lastmod' ||
                node.name === 'priority' ||
                node.name === 'changefreq'
            ) {
                this.currentTag = node.name;
            }
        }
        if (node.name === 'urlset') {
            this.rootTagName = 'urlset';
        }
        if (node.name === 'sitemapindex') {
            this.rootTagName = 'sitemapindex';
        }
    }

    private onCloseTag(name: string) {
        if (name === 'loc' || name === 'lastmod' || name === 'priority' || name === 'changefreq') {
            this.currentTag = undefined;
        }

        if (name === 'url' && this.url.url !== undefined) {
            this.push({ type: 'url', ...this.url, url: this.url.url } satisfies SitemapItem);
            this.url = {};
        }
    }

    private onText(text: string) {
        if (this.currentTag === 'loc') {
            if (this.rootTagName === 'sitemapindex') {
                this.push({ type: 'sitemapUrl', url: text } satisfies SitemapItem);
            }

            if (this.rootTagName === 'urlset') {
                this.url ??= {};
                this.url.url = text;
            }
        }

        text = text.trim();

        if (this.currentTag === 'lastmod') {
            this.url.lastmod = new Date(text);
        }

        if (this.currentTag === 'priority') {
            this.url.priority = Number(text);
        }

        if (this.currentTag === 'changefreq') {
            if (['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].includes(text)) {
                this.url.changefreq = text as SitemapUrl['changefreq'];
            }
        }
    }
}

export async function* parseSitemap(initialSources: SitemapSource[], proxyUrl?: string): AsyncIterable<SitemapUrl> {
    const { gotScraping } = await import('got-scraping');
    const { fileTypeStream } = await import('file-type');

    const sources = [...initialSources];
    const visitedSitemapUrls = new Set<string>();

    const createParser = (contentType: string = '', url?: URL): Duplex => {
        let mimeType: MIMEType | null;

        try {
            mimeType = new MIMEType(contentType);
        } catch (e) {
            mimeType = null;
        }

        if (mimeType?.isXML() || url?.pathname.endsWith('.xml')) {
            return new SitemapXmlParser();
        }

        if (mimeType?.essence === 'text/plain' || url?.pathname.endsWith('.txt')) {
            return new SitemapTxtParser();
        }

        throw new Error(`Unsupported sitemap content type (contentType = ${contentType}, url = ${url?.toString()})`);
    };

    while (sources.length > 0) {
        const source = sources.pop()!;
        let items: AsyncIterable<SitemapItem> | null = null;

        if (source.type === 'url') {
            const sitemapUrl = new URL(source.url);
            visitedSitemapUrls.add(sitemapUrl.toString());

            try {
                const sitemapStream = await new Promise<ReturnType<typeof gotScraping.stream>>((resolve, reject) => {
                    const request = gotScraping.stream({ url: sitemapUrl, proxyUrl, method: 'GET' });
                    request.on('response', () => resolve(request));
                    request.on('error', reject);
                });

                if (sitemapStream.response!.statusCode === 200) {
                    let contentType = sitemapStream.response!.headers['content-type'];

                    const streamWithType = await fileTypeStream(sitemapStream);
                    if (streamWithType.fileType !== undefined) {
                        contentType = streamWithType.fileType.mime;
                    }

                    let isGzipped = false;

                    if (
                        contentType !== undefined
                            ? contentType === 'application/gzip'
                            : sitemapUrl.pathname.endsWith('.gz')
                    ) {
                        isGzipped = true;

                        if (sitemapUrl.pathname.endsWith('.gz')) {
                            sitemapUrl.pathname = sitemapUrl.pathname.substring(0, sitemapUrl.pathname.length - 3);
                        }
                    }

                    items = pipeline(
                        streamWithType,
                        isGzipped ? createGunzip() : new PassThrough(),
                        createParser(contentType, sitemapUrl),
                        (error) => {
                            if (error !== undefined) {
                                log.warning(`Malformed sitemap content: ${sitemapUrl}, ${error}`);
                            }
                        },
                    );
                }
            } catch (e) {
                log.warning(`Malformed sitemap content: ${sitemapUrl}, ${e}`);
            }
        } else if (source.type === 'raw') {
            items = pipeline(Readable.from([source.content]), createParser('text/xml'), (error) => {
                if (error !== undefined) {
                    log.warning(`Malformed sitemap content: ${error}`);
                }
            });
        }

        if (items === null) {
            continue;
        }

        for await (const item of items) {
            if (item.type === 'sitemapUrl' && !visitedSitemapUrls.has(item.url)) {
                sources.push({ type: 'url', url: item.url });
            }

            if (item.type === 'url') {
                yield item;
            }
        }
    }
}

/**
 * Loads one or more sitemaps from given URLs, following references in sitemap index files, and exposes the contained URLs.
 *
 * **Example usage:**
 * ```javascript
 * // Load a sitemap
 * const sitemap = await Sitemap.load(['https://example.com/sitemap.xml', 'https://example.com/sitemap_2.xml.gz']);
 *
 * // Enqueue all the contained URLs (including those from sub-sitemaps from sitemap indexes)
 * await crawler.addRequests(sitemap.urls);
 * ```
 */
export class Sitemap {
    constructor(readonly urls: string[]) {}

    /**
     * Try to load sitemap from the most common locations - `/sitemap.xml` and `/sitemap.txt`.
     * For loading based on `Sitemap` entries in `robots.txt`, the {@apilink RobotsFile} class should be used.
     * @param url The domain URL to fetch the sitemap for.
     * @param proxyUrl A proxy to be used for fetching the sitemap file.
     */
    static async tryCommonNames(url: string, proxyUrl?: string): Promise<Sitemap> {
        const sitemapUrls: string[] = [];

        const sitemapUrl = new URL(url);
        sitemapUrl.search = '';

        sitemapUrl.pathname = '/sitemap.xml';
        sitemapUrls.push(sitemapUrl.toString());

        sitemapUrl.pathname = '/sitemap.txt';
        sitemapUrls.push(sitemapUrl.toString());

        return Sitemap.load(sitemapUrls, proxyUrl);
    }

    /**
     * Fetch sitemap content from given URL or URLs and return URLs of referenced pages.
     * @param urls sitemap URL(s)
     * @param proxyUrl URL of a proxy to be used for fetching sitemap contents
     */
    static async load(urls: string | string[], proxyUrl?: string): Promise<Sitemap> {
        return await this.parse(
            (Array.isArray(urls) ? urls : [urls]).map((url) => ({ type: 'url', url })),
            proxyUrl,
        );
    }

    /**
     * Parse XML sitemap content from a string and return URLs of referenced pages. If the sitemap references other sitemaps, they will be loaded via HTTP.
     * @param content XML sitemap content
     * @param proxyUrl URL of a proxy to be used for fetching sitemap contents
     */
    static async fromXmlString(content: string, proxyUrl?: string): Promise<Sitemap> {
        return await this.parse([{ type: 'raw', content }], proxyUrl);
    }

    protected static async parse(sources: SitemapSource[], proxyUrl?: string): Promise<Sitemap> {
        const urls: string[] = [];

        try {
            for await (const item of parseSitemap(sources, proxyUrl)) {
                urls.push(item.url);
            }
        } catch (e) {
            return new Sitemap([]);
        }

        return new Sitemap(urls);
    }
}
