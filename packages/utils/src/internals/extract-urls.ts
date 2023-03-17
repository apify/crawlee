import ow from 'ow';
import { gotScraping } from 'got-scraping';
import { URL_NO_COMMAS_REGEX } from './general';

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
}

/**
 * Returns a promise that resolves to an array of urls parsed from the resource available at the provided url.
 * Optionally, custom regular expression and encoding may be provided.
 */
export async function downloadListOfUrls(options: DownloadListOfUrlsOptions): Promise<string[]> {
    ow(options, ow.object.exactShape({
        url: ow.string.url,
        encoding: ow.optional.string,
        urlRegExp: ow.optional.regExp,
        proxyUrl: ow.optional.string,
    }));
    const { url, encoding = 'utf8', urlRegExp = URL_NO_COMMAS_REGEX, proxyUrl } = options;

    // Try to detect wrong urls and fix them. Currently, detects only sharing url instead of csv download one.
    const match = url.match(/^(https:\/\/docs\.google\.com\/spreadsheets\/d\/(?:\w|-)+)\/?/);
    let fixedUrl = url;

    if (match) {
        fixedUrl = `${match[1]}/gviz/tq?tqx=out:csv`;
    }

    const { body: string } = await gotScraping({ url: fixedUrl, encoding, proxyUrl });

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
    ow(options, ow.object.exactShape({
        string: ow.string,
        urlRegExp: ow.optional.regExp,
    }));
    const { string, urlRegExp = URL_NO_COMMAS_REGEX } = options;
    return string.match(urlRegExp) || [];
}
