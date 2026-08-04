import { FetchHttpClient } from '@crawlee/http-client';
import type { BaseHttpClient } from '@crawlee/http-client';
import { z } from 'zod';

import { URL_NO_COMMAS_REGEX } from './general.js';
import { httpClient as httpClientSchema } from './schemas.js';
import { parseArgument } from './validation.js';

const downloadListOfUrlsOptionsSchema = z.strictObject({
    url: z.url(),
    encoding: z.string().default('utf8'),
    urlRegExp: z.instanceof(RegExp).default(URL_NO_COMMAS_REGEX),
    proxyUrl: z.string().optional(),
    httpClient: httpClientSchema.default(() => new FetchHttpClient()),
});

const extractUrlsOptionsSchema = z.strictObject({
    string: z.string(),
    urlRegExp: z.instanceof(RegExp).default(URL_NO_COMMAS_REGEX),
});

export interface DownloadListOfUrlsOptions {
    /**
     * URL to the file
     */
    url: string;

    /**
     * The encoding of the file.
     * @default 'utf8'
     */
    encoding?: BufferEncoding;

    /**
     * Custom regular expression to identify the URLs in the file to extract.
     * The regular expression should be case-insensitive and have global flag set (i.e. `/something/gi`).
     * @default URL_NO_COMMAS_REGEX
     */
    urlRegExp?: RegExp;

    /** Allows to use a proxy for the download request. */
    proxyUrl?: string;

    /**
     * Custom HTTP client to use for downloading the file.
     */
    httpClient?: BaseHttpClient;
}

/**
 * Returns a promise that resolves to an array of urls parsed from the resource available at the provided url.
 * Optionally, custom regular expression and encoding may be provided.
 */
export async function downloadListOfUrls(options: DownloadListOfUrlsOptions): Promise<string[]> {
    const { url, encoding, urlRegExp, proxyUrl, httpClient } = parseArgument(options, downloadListOfUrlsOptionsSchema);

    // Try to detect wrong urls and fix them. Currently, detects only sharing url instead of csv download one.
    const match = /^(https:\/\/docs\.google\.com\/spreadsheets\/d\/(?:\w|-)+)\/?/.exec(url);
    let fixedUrl = url;

    if (match) {
        fixedUrl = `${match[1]}/gviz/tq?tqx=out:csv`;
    }

    const response = await httpClient.sendRequest(new Request(fixedUrl, { method: 'GET' }), {
        proxyUrl,
    });

    const string = new TextDecoder(encoding).decode(new Uint8Array(await response.arrayBuffer()));

    return extractUrls({ string, urlRegExp });
}

export interface ExtractUrlsOptions {
    /**
     * The string to extract URLs from.
     */
    string: string;

    /**
     * Custom regular expression
     * @default URL_NO_COMMAS_REGEX
     */
    urlRegExp?: RegExp;
}

/**
 * Collects all URLs in an arbitrary string to an array, optionally using a custom regular expression.
 */
export function extractUrls(options: ExtractUrlsOptions): string[] {
    const { string, urlRegExp } = parseArgument(options, extractUrlsOptionsSchema);
    const lines = string.split('\n');
    const result: string[] = [];

    for (const line of lines) {
        result.push(...(line.match(urlRegExp) ?? []));
    }

    return result;
}

/**
 * Helper function used to validate URLs used when extracting URLs from a page
 */
export function tryAbsoluteURL(href: string, baseUrl: string): string | undefined {
    try {
        return new URL(href, baseUrl).href;
    } catch {
        return undefined;
    }
}
