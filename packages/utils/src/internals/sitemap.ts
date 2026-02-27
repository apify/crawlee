import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { PassThrough, pipeline, Readable, Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip } from 'node:zlib';

import { FetchHttpClient } from '@crawlee/http-client';
import type { BaseHttpClient } from '@crawlee/types';
import { fileTypeStream } from 'file-type';
import sax from 'sax';
import MIMEType from 'whatwg-mimetype';

import log from '@apify/log';

import { mergeAsyncIterables } from './iterables.js';
import { RobotsFile } from './robots.js';

interface SitemapUrlData {
    loc: string;
    lastmod?: Date;
    changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
    priority?: number;
}

export type SitemapUrl = SitemapUrlData & {
    originSitemapUrl: string;
};

interface NestedSitemap {
    loc: string;
    originSitemapUrl: null;
}

type SitemapSource = ({ type: 'url'; url: string } | { type: 'raw'; content: string }) & { depth?: number };
type SitemapItem = ({ type: 'url' } & SitemapUrlData) | { type: 'sitemapUrl'; url: string };

class SitemapTxtParser extends Transform {
    private decoder: StringDecoder = new StringDecoder('utf8');
    private buffer = '';

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
                    this.push({ type: 'url', loc: url } satisfies SitemapItem);
                }

                this.buffer = '';
            } else if (parts.length > 0) {
                for (const url of parts.slice(0, -1)) {
                    this.push({ type: 'url', loc: url } satisfies SitemapItem);
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

        if (name === 'url' && this.url.loc !== undefined) {
            this.push({ type: 'url', ...this.url, loc: this.url.loc } satisfies SitemapItem);
            this.url = {};
        }
    }

    private onText(text: string) {
        if (this.currentTag === 'loc') {
            if (this.rootTagName === 'sitemapindex') {
                this.push({ type: 'sitemapUrl', url: text.trim() } satisfies SitemapItem);
            }

            if (this.rootTagName === 'urlset') {
                this.url ??= {};
                this.url.loc = text.trim();
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

export interface ParseSitemapOptions {
    /**
     * If set to `true`, elements referring to other sitemaps will be emitted as special objects with `originSitemapUrl` set to `null`.
     */
    emitNestedSitemaps?: true | false;
    /**
     * Maximum depth of nested sitemaps to follow.
     */
    maxDepth?: number;
    /**
     * Number of retries for fetching sitemaps. The counter resets for each nested sitemap.
     */
    sitemapRetries?: number;
    /**
     * Timeout settings for network requests when fetching sitemaps. By default this is `30000` milliseconds (30 seconds).
     */
    timeoutMillis?: number;
    /**
     * If true, the parser will log a warning if it fails to fetch a sitemap due to a network error
     * @default true
     */
    reportNetworkErrors?: boolean;
    /**
     * Custom HTTP client to be used for fetching sitemaps.
     */
    httpClient?: BaseHttpClient;
}

export async function* parseSitemap<T extends ParseSitemapOptions>(
    initialSources: SitemapSource[],
    proxyUrl?: string,
    options?: T,
): AsyncIterable<T['emitNestedSitemaps'] extends true ? SitemapUrl | NestedSitemap : SitemapUrl> {
    const {
        httpClient = new FetchHttpClient(),
        emitNestedSitemaps = false,
        maxDepth = Infinity,
        sitemapRetries = 3,
        timeoutMillis: timeout = 30000,
        reportNetworkErrors = true,
    } = options ?? {};

    const sources = [...initialSources];
    const visitedSitemapUrls = new Set<string>();

    const createParser = (contentType = '', url?: URL): Duplex => {
        let mimeType: MIMEType | null;

        try {
            mimeType = new MIMEType(contentType);
        } catch {
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
        const source = sources.shift()!;

        if ((source?.depth ?? 0) > maxDepth) {
            log.debug(
                `Skipping sitemap ${source.type === 'url' ? source.url : ''} because it reached max depth ${maxDepth}.`,
            );
            continue;
        }

        let items: AsyncIterable<SitemapItem> | null = null;

        if (source.type === 'url') {
            const sitemapUrl = new URL(source.url);
            visitedSitemapUrls.add(sitemapUrl.toString());
            let retriesLeft = sitemapRetries + 1;

            while (retriesLeft-- > 0) {
                try {
                    let sitemapResponse: Response | null;

                    try {
                        sitemapResponse = await httpClient.sendRequest(
                            new Request(sitemapUrl, {
                                method: 'GET',
                                headers: {
                                    accept: 'text/plain, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8',
                                },
                            }),
                            {
                                proxyUrl,
                                timeoutMillis: timeout,
                            },
                        );
                    } catch (error: any) {
                        sitemapResponse = null;
                    }

                    let error: { error: Error; type: 'fetch' | 'parser' } | null = null;

                    if (sitemapResponse && sitemapResponse.status >= 200 && sitemapResponse.status < 300) {
                        let contentType = sitemapResponse.headers.get('content-type');

                        if (sitemapResponse.body === null) {
                            break;
                        }
                        const streamWithType = await fileTypeStream(Readable.fromWeb(sitemapResponse.body as any));
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
                            createParser(contentType ?? undefined, sitemapUrl),
                            (e) => {
                                if (e !== undefined && e !== null) {
                                    error = { type: 'parser', error: e };
                                }
                            },
                        );
                    } else {
                        error = {
                            type: 'fetch',
                            error: new Error(
                                `Failed to fetch sitemap: ${sitemapUrl}, status code: ${sitemapResponse?.status}`,
                            ),
                        };
                    }

                    if (error !== null) {
                        const shouldIgnoreError = error.type === 'fetch' && !reportNetworkErrors;
                        if (!shouldIgnoreError) {
                            throw error.error;
                        }
                    } else {
                        break;
                    }
                } catch (e) {
                    log.warning(
                        `Malformed sitemap content: ${sitemapUrl}, ${retriesLeft === 0 ? 'no retries left.' : 'retrying...'} (${e})`,
                    );
                }
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
                sources.push({ type: 'url', url: item.url, depth: (source.depth ?? 0) + 1 });
                if (emitNestedSitemaps) {
                    yield { loc: item.url, originSitemapUrl: null } as any;
                }
            }

            if (item.type === 'url') {
                yield {
                    ...item,
                    originSitemapUrl:
                        source.type === 'url'
                            ? source.url
                            : `raw://${createHash('sha256').update(source.content).digest('base64')}`,
                };
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
     * For loading based on `Sitemap` entries in `robots.txt`, the {@apilink RobotsTxtFile} class should be used.
     * @param url The domain URL to fetch the sitemap for.
     * @param proxyUrl A proxy to be used for fetching the sitemap file.
     */
    static async tryCommonNames(
        url: string,
        proxyUrl?: string,
        parseSitemapOptions?: ParseSitemapOptions,
    ): Promise<Sitemap> {
        const sitemapUrls: string[] = [];

        const sitemapUrl = new URL(url);
        sitemapUrl.search = '';

        sitemapUrl.pathname = '/sitemap.xml';
        sitemapUrls.push(sitemapUrl.toString());

        sitemapUrl.pathname = '/sitemap.txt';
        sitemapUrls.push(sitemapUrl.toString());

        return Sitemap.load(sitemapUrls, proxyUrl, { reportNetworkErrors: false, ...parseSitemapOptions });
    }

    /**
     * Fetch sitemap content from given URL or URLs and return URLs of referenced pages.
     * @param urls sitemap URL(s)
     * @param proxyUrl URL of a proxy to be used for fetching sitemap contents
     */
    static async load(
        urls: string | string[],
        proxyUrl?: string,
        parseSitemapOptions?: ParseSitemapOptions,
    ): Promise<Sitemap> {
        return await this.parse(
            (Array.isArray(urls) ? urls : [urls]).map((url) => ({ type: 'url', url })),
            proxyUrl,
            parseSitemapOptions,
        );
    }

    /**
     * Parse XML sitemap content from a string and return URLs of referenced pages. If the sitemap references other sitemaps, they will be loaded via HTTP.
     * @param content XML sitemap content
     * @param proxyUrl URL of a proxy to be used for fetching sitemap contents
     */
    static async fromXmlString(
        content: string,
        proxyUrl?: string,
        parseSitemapOptions?: ParseSitemapOptions,
    ): Promise<Sitemap> {
        return await this.parse([{ type: 'raw', content }], proxyUrl, parseSitemapOptions);
    }

    protected static async parse(
        sources: SitemapSource[],
        proxyUrl?: string,
        parseSitemapOptions?: ParseSitemapOptions,
    ): Promise<Sitemap> {
        const urls: string[] = [];

        try {
            for await (const item of parseSitemap(sources, proxyUrl, parseSitemapOptions)) {
                urls.push(item.loc);
            }
        } catch {
            return new Sitemap([]);
        }

        return new Sitemap(urls);
    }
}

/**
 * Given a list of URLs, discover related sitemap files for these domains by checking the `robots.txt` file,
 * the default `sitemap.xml` & `sitemap.txt` files and the URLs themselves.
 * @param `urls` The list of URLs to discover sitemaps for.
 * @param `options` Options for sitemap discovery
 * @returns An async iterable with the discovered sitemap URLs.
 */
export async function* discoverValidSitemaps(
    urls: string[],
    options: {
        /**
         * Proxy URL to be used for network requests.
         */
        proxyUrl?: string;
        /**
         * HTTP client to be used for network requests.
         */
        httpClient?: BaseHttpClient;
    } = {},
): AsyncIterable<string> {
    const { proxyUrl, httpClient = new FetchHttpClient() } = options;
    const sitemapUrls = new Set<string>();

    const addSitemapUrl = (url: string): string | undefined => {
        const sizeBefore = sitemapUrls.size;

        sitemapUrls.add(url);

        if (sitemapUrls.size > sizeBefore) {
            return url;
        }

        return undefined;
    };

    const urlExists = async (url: string): Promise<boolean> => {
        if (!httpClient) {
            return false;
        }
        try {
            const response = await httpClient.sendRequest(new Request(url, { method: 'HEAD' }), { proxyUrl });
            return response.status >= 200 && response.status < 400;
        } catch {
            return false;
        }
    };

    const discoverSitemapsForDomainUrls = async function* (hostname: string, domainUrls: string[]) {
        if (!hostname) {
            return;
        }

        try {
            const robotsFile = await RobotsFile.find(domainUrls[0], { proxyUrl, httpClient });

            for (const sitemapUrl of robotsFile.getSitemaps()) {
                if (addSitemapUrl(sitemapUrl)) {
                    yield sitemapUrl;
                }
            }
        } catch (err) {
            log.warning(`Failed to fetch robots.txt file for ${hostname}`, { error: err });
        }

        const sitemapUrl = domainUrls.find((url) => /sitemap\.(?:xml|txt)(?:\.gz)?$/i.test(url));

        if (sitemapUrl !== undefined) {
            if (addSitemapUrl(sitemapUrl)) {
                yield sitemapUrl;
            }
        } else {
            const firstUrl = new URL(domainUrls[0]);
            const possibleSitemapPathnames = ['/sitemap.xml', '/sitemap.txt', '/sitemap_index.xml'];
            for (const pathname of possibleSitemapPathnames) {
                firstUrl.pathname = pathname;
                if (await urlExists(firstUrl.toString())) {
                    if (addSitemapUrl(firstUrl.toString())) {
                        yield firstUrl.toString();
                    }
                }
            }
        }
    };

    const groupedUrls = urls.reduce(
        (acc, url) => {
            const hostname = new URL(url)?.hostname ?? '';
            acc[hostname] ??= [];
            acc[hostname].push(url);
            return acc;
        },
        {} as Record<string, string[]>,
    );

    const iterables = Object.entries(groupedUrls).map(([hostname, domainUrls]) =>
        discoverSitemapsForDomainUrls(hostname, domainUrls),
    );

    const discoveredUrls = new Set<string>();

    for await (const url of mergeAsyncIterables(...iterables)) {
        if (discoveredUrls.has(url)) {
            continue;
        }
        discoveredUrls.add(url);
        yield url;
    }
}
