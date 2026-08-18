import { createHash } from 'node:crypto';
import { PassThrough, pipeline, Readable, Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip } from 'node:zlib';
import { FetchHttpClient } from '@crawlee/http-client';
import MIMEType from 'whatwg-mimetype';
import { mergeAsyncIterables } from './iterables.js';
import { RobotsTxtFile } from './robots.js';
import { filterUrl } from './url.js';
class SitemapTxtParser extends Transform {
    #decoder = new StringDecoder('utf8');
    #buffer = '';
    constructor() {
        super({
            readableObjectMode: true,
            transform: (chunk, _encoding, callback) => {
                this.processBuffer(this.#decoder.write(chunk), false);
                callback();
            },
            flush: (callback) => {
                this.processBuffer(this.#decoder.end(), true);
                callback();
            },
        });
    }
    processBuffer(input, finalize) {
        this.#buffer += input;
        if (finalize || this.#buffer.includes('\n')) {
            const parts = this.#buffer
                .split('\n')
                .map((part) => part.trim())
                .filter((part) => part.length > 0);
            if (finalize) {
                for (const url of parts) {
                    this.push({ type: 'url', loc: url });
                }
                this.#buffer = '';
            }
            else if (parts.length > 0) {
                for (const url of parts.slice(0, -1)) {
                    this.push({ type: 'url', loc: url });
                }
                this.#buffer = parts.at(-1);
            }
        }
    }
}
class SitemapXmlParser extends Transform {
    #decoder = new StringDecoder('utf8');
    #parser;
    #rootTagName;
    #currentTag = undefined;
    #url = {};
    static async create() {
        const { SAXParser } = await import('sax');
        return new SitemapXmlParser(new SAXParser(true));
    }
    constructor(parser) {
        super({
            readableObjectMode: true,
            transform: (chunk, _encoding, callback) => {
                this.#parser.write(this.#decoder.write(chunk));
                callback();
            },
            flush: (callback) => {
                const rest = this.#decoder.end();
                if (rest.length > 0) {
                    this.#parser.write(rest);
                }
                this.#parser.end();
                callback();
            },
        });
        this.#parser = parser;
        this.#parser.onopentag = this.onOpenTag.bind(this);
        this.#parser.onclosetag = this.onCloseTag.bind(this);
        this.#parser.ontext = this.onText.bind(this);
        this.#parser.oncdata = this.onText.bind(this);
        this.#parser.onerror = this.destroy.bind(this);
    }
    onOpenTag(node) {
        if (this.#rootTagName !== undefined) {
            if (node.name === 'loc' ||
                node.name === 'lastmod' ||
                node.name === 'priority' ||
                node.name === 'changefreq') {
                this.#currentTag = node.name;
            }
        }
        if (node.name === 'urlset') {
            this.#rootTagName = 'urlset';
        }
        if (node.name === 'sitemapindex') {
            this.#rootTagName = 'sitemapindex';
        }
    }
    onCloseTag(name) {
        if (name === 'loc' || name === 'lastmod' || name === 'priority' || name === 'changefreq') {
            this.#currentTag = undefined;
        }
        if (name === 'url') {
            if (this.#url.loc !== undefined) {
                this.push({ type: 'url', ...this.#url, loc: this.#url.loc });
            }
            this.#url = {};
        }
    }
    onText(text) {
        if (this.#currentTag === 'loc') {
            if (this.#rootTagName === 'sitemapindex') {
                this.push({ type: 'sitemapUrl', url: text.trim() });
            }
            if (this.#rootTagName === 'urlset') {
                this.#url ??= {};
                this.#url.loc = text.trim();
            }
        }
        text = text.trim();
        if (this.#currentTag === 'lastmod') {
            const lastmod = new Date(text);
            if (!Number.isNaN(lastmod.getTime())) {
                this.#url.lastmod = lastmod;
            }
        }
        if (this.#currentTag === 'priority') {
            this.#url.priority = Number(text);
        }
        if (this.#currentTag === 'changefreq') {
            if (['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].includes(text)) {
                this.#url.changefreq = text;
            }
        }
    }
}
export async function* parseSitemap(initialSources, proxyUrl, options) {
    const { httpClient = new FetchHttpClient(), emitNestedSitemaps = false, maxDepth = Infinity, sitemapRetries = 3, timeoutMillis: timeout = 30000, reportNetworkErrors = true, nestedSitemapFilter, enqueueStrategy = 'same-hostname', logger, } = options ?? {};
    const sources = [...initialSources];
    const visitedSitemapUrls = new Set();
    const createParser = async (contentType = '', url) => {
        let mimeType;
        try {
            mimeType = new MIMEType(contentType);
        }
        catch {
            mimeType = null;
        }
        if (mimeType?.isXML() || url?.pathname.endsWith('.xml')) {
            return SitemapXmlParser.create();
        }
        if (mimeType?.essence === 'text/plain' || url?.pathname.endsWith('.txt')) {
            return new SitemapTxtParser();
        }
        throw new Error(`Unsupported sitemap content type (contentType = ${contentType}, url = ${url?.toString()})`);
    };
    while (sources.length > 0) {
        const source = sources.shift();
        if ((source?.depth ?? 0) > maxDepth) {
            continue;
        }
        let items = null;
        // Parent URL, parsed once and reused as the origin for the strategy checks below.
        let sitemapUrl;
        if (source.type === 'url') {
            sitemapUrl = new URL(source.url);
            visitedSitemapUrls.add(sitemapUrl.toString());
            let retriesLeft = sitemapRetries + 1;
            while (retriesLeft-- > 0) {
                try {
                    let sitemapResponse;
                    try {
                        sitemapResponse = await httpClient.sendRequest(new Request(sitemapUrl, {
                            method: 'GET',
                            headers: {
                                accept: '*/*',
                            },
                        }), {
                            proxyUrl,
                            timeoutMillis: timeout,
                        });
                    }
                    catch (error) {
                        sitemapResponse = null;
                    }
                    let error = null;
                    if (sitemapResponse && sitemapResponse.status >= 200 && sitemapResponse.status < 300) {
                        let contentType = sitemapResponse.headers.get('content-type');
                        if (sitemapResponse.body === null) {
                            break;
                        }
                        const { fileTypeStream } = await import('file-type');
                        const streamWithType = await fileTypeStream(Readable.fromWeb(sitemapResponse.body));
                        if (streamWithType.fileType !== undefined) {
                            contentType = streamWithType.fileType.mime;
                        }
                        let isGzipped = false;
                        if (contentType !== undefined
                            ? contentType === 'application/gzip'
                            : sitemapUrl.pathname.endsWith('.gz')) {
                            isGzipped = true;
                            if (sitemapUrl.pathname.endsWith('.gz')) {
                                sitemapUrl.pathname = sitemapUrl.pathname.substring(0, sitemapUrl.pathname.length - 3);
                            }
                        }
                        items = pipeline(streamWithType, isGzipped ? createGunzip() : new PassThrough(), await createParser(contentType ?? undefined, sitemapUrl), (e) => {
                            if (e !== undefined && e !== null) {
                                error = { type: 'parser', error: e };
                            }
                        });
                    }
                    else {
                        error = {
                            type: 'fetch',
                            error: new Error(`Failed to fetch sitemap: ${sitemapUrl}, status code: ${sitemapResponse?.status}`),
                        };
                    }
                    if (error !== null) {
                        const shouldIgnoreError = error.type === 'fetch' && !reportNetworkErrors;
                        if (!shouldIgnoreError) {
                            throw error.error;
                        }
                    }
                    else {
                        break;
                    }
                }
                catch (e) {
                    logger?.warning(`Malformed sitemap content: ${sitemapUrl}, ${retriesLeft === 0 ? 'no retries left.' : 'retrying...'} (${e})`);
                }
            }
        }
        else if (source.type === 'raw') {
            items = pipeline(Readable.from([source.content]), await createParser('text/xml'), (error) => {
                if (error !== undefined) {
                    logger?.warning(`Malformed sitemap content: ${error}`);
                }
            });
        }
        if (items === null) {
            continue;
        }
        // URL entries dropped by the enqueue strategy filter, reported in one warning per sitemap after
        // the loop (per-entry warnings could flood the log; individual drops are logged at debug level).
        let droppedUrlEntries = 0;
        for await (const item of items) {
            if (item.type === 'sitemapUrl' && !visitedSitemapUrls.has(item.url)) {
                if (nestedSitemapFilter && !nestedSitemapFilter(item.url)) {
                    logger?.debug(`Skipping sitemap ${item.url} due to nestedSitemapFilter.`);
                    continue;
                }
                // Keep only nested sitemaps matching the strategy (and using http(s)) relative to the
                // parent. Raw string sources have no parent URL, so the check is skipped.
                if (source.type === 'url') {
                    const { allowed, reason } = filterUrl(item.url, sitemapUrl, enqueueStrategy);
                    if (!allowed) {
                        logger?.warning(`Skipping nested sitemap ${item.url} (parent ${source.url}): ${reason}.`);
                        continue;
                    }
                }
                sources.push({ type: 'url', url: item.url, depth: (source.depth ?? 0) + 1 });
                if (emitNestedSitemaps) {
                    yield { loc: item.url, originSitemapUrl: null };
                }
            }
            if (item.type === 'url') {
                // Keep only URL entries that match the enqueue strategy relative to the parent (see above).
                if (source.type === 'url') {
                    const { allowed, reason } = filterUrl(item.loc, sitemapUrl, enqueueStrategy);
                    if (!allowed) {
                        droppedUrlEntries++;
                        logger?.debug(`Skipping sitemap URL ${item.loc} (parent ${source.url}): ${reason}.`);
                        continue;
                    }
                }
                yield {
                    ...item,
                    originSitemapUrl: source.type === 'url'
                        ? source.url
                        : `raw://${createHash('sha256').update(source.content).digest('base64')}`,
                };
            }
        }
        if (droppedUrlEntries > 0 && source.type === 'url') {
            logger?.warning(`Skipped ${droppedUrlEntries} URL(s) from sitemap ${source.url} not matching enqueue strategy '${enqueueStrategy}' (or using a non-http(s) scheme). Enable debug logs to see each skipped URL.`);
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
    urls;
    constructor(urls) {
        this.urls = urls;
    }
    /**
     * Try to load sitemap from the most common locations - `/sitemap.xml` and `/sitemap.txt`.
     * For loading based on `Sitemap` entries in `robots.txt`, the {@apilink RobotsTxtFile} class should be used.
     * @param url The domain URL to fetch the sitemap for.
     * @param proxyUrl A proxy to be used for fetching the sitemap file.
     */
    static async tryCommonNames(url, proxyUrl, parseSitemapOptions) {
        const sitemapUrls = [];
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
    static async load(urls, proxyUrl, parseSitemapOptions) {
        return await this.parse((Array.isArray(urls) ? urls : [urls]).map((url) => ({ type: 'url', url })), proxyUrl, parseSitemapOptions);
    }
    /**
     * Parse XML sitemap content from a string and return URLs of referenced pages. If the sitemap references other sitemaps, they will be loaded via HTTP.
     * @param content XML sitemap content
     * @param proxyUrl URL of a proxy to be used for fetching sitemap contents
     */
    static async fromXmlString(content, proxyUrl, parseSitemapOptions) {
        return await this.parse([{ type: 'raw', content }], proxyUrl, parseSitemapOptions);
    }
    static async parse(sources, proxyUrl, parseSitemapOptions) {
        const urls = [];
        try {
            for await (const item of parseSitemap(sources, proxyUrl, parseSitemapOptions)) {
                urls.push(item.loc);
            }
        }
        catch (e) {
            parseSitemapOptions?.logger?.warning(`Sitemap.load: Failed to load sitemap, returning empty result. (${e})`);
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
export async function* discoverValidSitemaps(urls, options = {}) {
    const { proxyUrl, timeoutMillis = 60_000, signal: externalSignal, requestTimeoutMillis = 20_000, httpClient = new FetchHttpClient(), logger, } = options;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMillis);
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort();
        }
        else {
            externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        }
    }
    const signal = controller.signal;
    const sitemapUrls = new Set();
    const addSitemapUrl = (url) => {
        const sizeBefore = sitemapUrls.size;
        sitemapUrls.add(url);
        if (sitemapUrls.size > sizeBefore) {
            return url;
        }
        return undefined;
    };
    const urlExists = async (url) => {
        if (!httpClient) {
            return false;
        }
        try {
            const response = await httpClient.sendRequest(new Request(url, { method: 'HEAD' }), {
                proxyUrl,
                timeoutMillis: requestTimeoutMillis,
                signal,
            });
            return response.status >= 200 && response.status < 400;
        }
        catch {
            return false;
        }
    };
    const discoverSitemapsForDomainUrls = async function* (hostname, domainUrls) {
        if (!hostname) {
            return;
        }
        try {
            const robotsFile = await RobotsTxtFile.find(domainUrls[0], {
                proxyUrl,
                timeoutMillis: requestTimeoutMillis,
                signal,
                httpClient,
                logger,
            });
            // Surface all referenced sitemaps, including cross-host; scoping happens at load time.
            for (const sitemapUrl of robotsFile.getSitemaps({ enqueueStrategy: 'all' })) {
                if (addSitemapUrl(sitemapUrl)) {
                    yield sitemapUrl;
                }
            }
        }
        catch (err) {
            logger?.warning(`Failed to fetch robots.txt file for ${hostname}`, { error: err });
        }
        const sitemapUrl = domainUrls.find((url) => /sitemap(?:_index)?\.(?:xml|txt)(?:\.gz)?$/i.test(url));
        if (sitemapUrl !== undefined) {
            if (addSitemapUrl(sitemapUrl)) {
                yield sitemapUrl;
            }
        }
        else {
            const firstUrl = new URL(domainUrls[0]);
            const possibleSitemapPathnames = ['/sitemap.xml', '/sitemap.txt', '/sitemap_index.xml'];
            const candidateSitemapUrls = possibleSitemapPathnames.map((pathname) => {
                firstUrl.pathname = pathname;
                return firstUrl.toString();
            });
            const candidateResults = await Promise.allSettled(candidateSitemapUrls.map(urlExists));
            for (const [index, result] of candidateResults.entries()) {
                const candidateSitemapUrl = candidateSitemapUrls[index];
                if (result.status === 'fulfilled') {
                    if (result.value && addSitemapUrl(candidateSitemapUrl)) {
                        yield candidateSitemapUrl;
                    }
                }
                else {
                    logger?.debug(`Failed to check sitemap candidate ${candidateSitemapUrl} for ${hostname}`, {
                        error: result.reason,
                    });
                }
            }
        }
    };
    const groupedUrls = urls.reduce((acc, url) => {
        const hostname = new URL(url)?.hostname ?? '';
        acc[hostname] ??= [];
        acc[hostname].push(url);
        return acc;
    }, {});
    const iterables = Object.entries(groupedUrls).map(([hostname, domainUrls]) => discoverSitemapsForDomainUrls(hostname, domainUrls));
    const discoveredUrls = new Set();
    try {
        for await (const url of mergeAsyncIterables(...iterables)) {
            if (discoveredUrls.has(url)) {
                continue;
            }
            discoveredUrls.add(url);
            yield url;
        }
    }
    finally {
        clearTimeout(timeoutHandle);
        externalSignal?.removeEventListener('abort', onExternalAbort);
    }
}
