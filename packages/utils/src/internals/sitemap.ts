import { Readable, Writable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip } from 'node:zlib';

import log from '@apify/log';
import type { SAXStream } from 'sax';
import sax from 'sax';
import MIMEType from 'whatwg-mimetype';

type SitemapSource = { type: 'url'; url: string } | { type: 'raw'; content: string };

class ParsingState {
    sources: SitemapSource[] = [];
    urls: string[] = [];
    visitedSitemapUrls: string[] = [];
    context?: 'sitemapindex' | 'urlset';
    loc = false;

    resetContext() {
        this.context = undefined;
        this.loc = false;
    }
}

class SitemapTxtParser extends Writable {
    private decoder: StringDecoder = new StringDecoder('utf8');
    private buffer: string = '';

    constructor(
        private parsingState: ParsingState,
        private onEnd: () => void,
    ) {
        super();
    }

    private processBuffer(input: string, finalize: boolean): void {
        this.buffer += input;

        if (finalize || this.buffer.includes('\n')) {
            const parts = this.buffer
                .split('\n')
                .map((part) => part.trim())
                .filter((part) => part.length > 0);

            if (finalize) {
                this.parsingState.urls.push(...parts);
                this.buffer = '';
            } else if (parts.length > 0) {
                this.parsingState.urls.push(...parts.slice(0, -1));
                this.buffer = parts.at(-1)!;
            }
        }
    }

    override _write(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null | undefined) => void): void {
        this.processBuffer(this.decoder.write(chunk), false);
        callback();
    }

    override _final(callback: (error?: Error | null | undefined) => void): void {
        this.processBuffer(this.decoder.end(), true);
        callback();
        this.onEnd();
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

    protected static createXmlParser(
        parsingState: ParsingState,
        onEnd: () => void,
        onError: (error: Error) => void,
    ): SAXStream {
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

        const onText = (text: string) => {
            if (parsingState.loc) {
                if (parsingState.context === 'sitemapindex') {
                    if (!parsingState.visitedSitemapUrls.includes(text)) {
                        parsingState.sources.push({ type: 'url', url: text });
                    }
                }
                if (parsingState.context === 'urlset') {
                    parsingState.urls.push(text);
                }
            }
        };
        parser.on('text', onText);
        parser.on('cdata', onText);

        parser.on('end', onEnd);
        parser.on('error', onError);

        return parser;
    }

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
        const parsingState = new ParsingState();
        parsingState.sources = (Array.isArray(urls) ? urls : [urls]).map((url) => ({ type: 'url', url }));

        return await this.parse(parsingState, proxyUrl);
    }

    /**
     * Parse XML sitemap content from a string and return URLs of referenced pages. If the sitemap references other sitemaps, they will be loaded via HTTP.
     * @param content XML sitemap content
     * @param proxyUrl URL of a proxy to be used for fetching sitemap contents
     */
    static async fromXmlString(content: string, proxyUrl?: string): Promise<Sitemap> {
        const parsingState = new ParsingState();
        parsingState.sources = [{ type: 'raw', content }];

        return await this.parse(parsingState, proxyUrl);
    }

    protected static async parse(parsingState: ParsingState, proxyUrl?: string): Promise<Sitemap> {
        const { gotScraping } = await import('got-scraping');
        const { fileTypeStream } = await import('file-type');

        while (parsingState.sources.length > 0) {
            const source = parsingState.sources.pop()!;
            parsingState.resetContext();

            if (source.type === 'url') {
                const sitemapUrl = new URL(source.url);
                parsingState.visitedSitemapUrls.push(sitemapUrl.toString());

                try {
                    const sitemapStream = await new Promise<ReturnType<typeof gotScraping.stream>>(
                        (resolve, reject) => {
                            const request = gotScraping.stream({ url: sitemapUrl, proxyUrl, method: 'GET' });
                            request.on('response', () => resolve(request));
                            request.on('error', reject);
                        },
                    );

                    if (sitemapStream.response!.statusCode === 200) {
                        let contentType = sitemapStream.response!.headers['content-type'];

                        const streamWithType = await fileTypeStream(sitemapStream);
                        if (streamWithType.fileType !== undefined) {
                            contentType = streamWithType.fileType.mime;
                        }

                        await new Promise((resolve, reject) => {
                            let stream: Readable = streamWithType;

                            if (
                                contentType !== undefined
                                    ? contentType === 'application/gzip'
                                    : sitemapUrl.pathname.endsWith('.gz')
                            ) {
                                stream = stream.pipe(createGunzip()).on('error', reject);

                                if (sitemapUrl.pathname.endsWith('.gz')) {
                                    sitemapUrl.pathname = sitemapUrl.pathname.substring(
                                        0,
                                        sitemapUrl.pathname.length - 3,
                                    );
                                }
                            }

                            stream.pipe(this.createParser(resolve, reject, parsingState, contentType, sitemapUrl));
                        });
                    }
                } catch (e) {
                    log.warning(`Malformed sitemap content: ${sitemapUrl}, ${e}`);
                }
            }

            if (source.type === 'raw') {
                await new Promise((resolve, reject) => {
                    Readable.from([source.content]).pipe(this.createParser(resolve, reject, parsingState, 'text/xml'));
                });
            }
        }

        return new Sitemap(parsingState.urls);
    }

    protected static createParser(
        resolve: (value: unknown) => void,
        reject: (value: unknown) => void,
        parsingState: ParsingState,
        contentType: string = '',
        url?: URL,
    ) {
        let mimeType: MIMEType | null;

        try {
            mimeType = new MIMEType(contentType);
        } catch (e) {
            mimeType = null;
        }

        if (mimeType?.isXML() || url?.pathname.endsWith('.xml')) {
            return Sitemap.createXmlParser(parsingState, () => resolve(undefined), reject);
        }

        if (mimeType?.essence === 'text/plain' || url?.pathname.endsWith('.txt')) {
            return new SitemapTxtParser(parsingState, () => resolve(undefined));
        }

        throw new Error(`Unsupported sitemap content type (contentType = ${contentType}, url = ${url?.toString()})`);
    }
}
