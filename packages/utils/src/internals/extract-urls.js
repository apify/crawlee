import { FetchHttpClient } from '@crawlee/http-client';
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
/**
 * Returns a promise that resolves to an array of urls parsed from the resource available at the provided url.
 * Optionally, custom regular expression and encoding may be provided.
 */
export async function downloadListOfUrls(options) {
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
/**
 * Collects all URLs in an arbitrary string to an array, optionally using a custom regular expression.
 */
export function extractUrls(options) {
    const { string, urlRegExp } = parseArgument(options, extractUrlsOptionsSchema);
    const lines = string.split('\n');
    const result = [];
    for (const line of lines) {
        result.push(...(line.match(urlRegExp) ?? []));
    }
    return result;
}
/**
 * Helper function used to validate URLs used when extracting URLs from a page
 */
export function tryAbsoluteURL(href, baseUrl) {
    try {
        return new URL(href, baseUrl).href;
    }
    catch {
        return undefined;
    }
}
