/// <reference types="node" />
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
export declare function downloadListOfUrls(options: DownloadListOfUrlsOptions): Promise<string[]>;
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
export declare function extractUrls(options: ExtractUrlsOptions): string[];
//# sourceMappingURL=extract-urls.d.ts.map