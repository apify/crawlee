/// <reference types="node" />
export const FIREFOX_MOBILE_USER_AGENT: "Mozilla/5.0 (Android; Mobile; rv:14.0) Gecko/14.0 Firefox/14.0";
export const FIREFOX_DESKTOP_USER_AGENT: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:68.0) Gecko/20100101 Firefox/68.0";
export function requestAsBrowser(options: RequestAsBrowserOptions): Promise<Readable | IncomingMessage>;
/**
 * [@apify/http-request](https://www.npmjs.com/package/@apify/http-request) NPM package.
 */
export type RequestAsBrowserOptions = {
    /**
     * URL of the target endpoint. Supports both HTTP and HTTPS schemes.
     */
    url: string;
    /**
     * HTTP method.
     */
    method?: string;
    /**
     * Additional HTTP headers to add. It's only recommended to use this option,
     * with headers that are typically added by websites, such as cookies. Overriding
     * default browser headers will remove the masking this function provides.
     */
    headers?: Object;
    /**
     * An HTTP proxy to be passed down to the HTTP request. Supports proxy authentication with Basic Auth.
     */
    proxyUrl?: string;
    /**
     * Two-letter ISO 639 language code.
     */
    languageCode?: string;
    /**
     * Two-letter ISO 3166 country code.
     */
    countryCode?: string;
    /**
     * If `true`, the function uses User-Agent of a mobile browser.
     */
    useMobileVersion?: boolean;
    /**
     * Function accepts `response` object as a single parameter and should return true or false.
     * If function returns true request gets aborted. This function is passed to the
     * [
     */
    abortFunction?: AbortFunction;
};
export type AbortFunction = (response: IncomingMessage) => boolean;
import { Readable } from  "stream";
import { IncomingMessage } from "http";
