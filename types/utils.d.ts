/// <reference types="node" />
export function newClient(): any;
export function logSystemInfo(): void;
/**
 * Gets the default instance of the `ApifyClient` class provided
 * <a href="https://docs.apify.com/api/apify-client-js/latest"
 * target="_blank">apify-client</a> by the NPM package.
 * The instance is created automatically by the Apify SDK and it is configured using the
 * `APIFY_API_BASE_URL`, `APIFY_USER_ID` and `APIFY_TOKEN` environment variables.
 *
 * The instance is used for all underlying calls to the Apify API in functions such as
 * {@link Apify#getValue} or {@link Apify#call}.
 * The settings of the client can be globally altered by calling the
 * <a href="https://docs.apify.com/api/apify-client-js/latest#ApifyClient-setOptions"
 * target="_blank">`Apify.client.setOptions()`</a> function.
 * Beware that altering these settings might have unintended effects on the entire Apify SDK package.
 *
 * @type {*}
 *
 * @memberof module:Apify
 * @name client
 */
export const apifyClient: any;
export function newPromise(): Promise<void>;
export function addCharsetToContentType(contentType: string): string;
export function isDocker(forceReset: boolean): Promise<boolean>;
export function sum(arr: number[]): number;
export function avg(arr: number[]): number;
export function weightedAvg(arrValues: number[], arrWeights: number[]): number;
export function getMemoryInfo(): Promise<MemoryInfo>;
export function isPromise(maybePromise: any): boolean;
export function isProduction(): boolean;
export function ensureDirExists(dirPath: any): any;
export function getFirstKey(dict: any): string | undefined;
export function getTypicalChromeExecutablePath(): string;
export function addTimeoutToPromise(promise: Promise<any>, timeoutMillis: number, errorMessage: string): Promise<any>;
export function isAtHome(): boolean;
export function sleep(millis: number): Promise<void>;
export function openLocalStorage(idOrName: any, defaultIdEnvVar: any, LocalClass: any, cache: any): Promise<any>;
export function openRemoteStorage(idOrName: any, defaultIdEnvVar: any, RemoteClass: any, cache: any, getOrCreateFunction: any): Promise<any>;
export function ensureTokenOrLocalStorageEnvExists(storageName: any): void;
export function snakeCaseToCamelCase(snakeCaseStr: string): string;
export function printOutdatedSdkWarning(): void;
export function parseContentTypeFromResponse(response: IncomingMessage): {
    type: string;
    charset: string;
};
export namespace publicUtils {
    export { isDocker };
    export { sleep };
    export { downloadListOfUrls };
    export { extractUrls };
    export { getRandomUserAgent };
    export { htmlToText };
    export { URL_NO_COMMAS_REGEX };
    export { URL_WITH_COMMAS_REGEX };
    export { createRequestDebugInfo };
    export { parseContentTypeFromResponse };
}
/**
 * Describes memory usage of an Actor.
 */
export type MemoryInfo = {
    /**
     * Total memory available in the system or container
     */
    totalBytes: number;
    /**
     * Amount of free memory in the system or container
     */
    freeBytes: number;
    /**
     * Amount of memory used (= totalBytes - freeBytes)
     */
    usedBytes: number;
    /**
     * Amount of memory used the current Node.js process
     */
    mainProcessBytes: number;
    /**
     * Amount of memory used by child processes of the current Node.js process
     */
    childProcessesBytes: number;
};
import { IncomingMessage } from "http";
declare function downloadListOfUrls({ url, encoding, urlRegExp }: {
    url: string;
    encoding?: string;
    urlRegExp?: RegExp;
}): Promise<string[]>;
declare function extractUrls({ string, urlRegExp }: {
    string: string;
    urlRegExp?: RegExp;
}): string[];
declare function getRandomUserAgent(): string;
declare function htmlToText(html: string | CheerioStatic): string;
/**
 * Default regular expression to match URLs in a string that may be plain text, JSON, CSV or other. It supports common URL characters
 * and does not support URLs containing commas or spaces. The URLs also may contain Unicode letters (not symbols).
 * @memberOf utils
 */
declare const URL_NO_COMMAS_REGEX: RegExp;
/**
 * Regular expression that, in addition to the default regular expression `URL_NO_COMMAS_REGEX`, supports matching commas in URL path and query.
 * Note, however, that this may prevent parsing URLs from comma delimited lists, or the URLs may become malformed.
 * @memberOf utils
 */
declare const URL_WITH_COMMAS_REGEX: RegExp;
declare function createRequestDebugInfo(request: Request | RequestOptions, response?: IncomingMessage | PuppeteerResponse | undefined, additionalFields?: Object | undefined): any;
import Request from "./request";
import { RequestOptions } from "./request";
import { Response as PuppeteerResponse } from "puppeteer";
export {};
