import type { Readable } from 'node:stream';

import type { AllowedHttpMethods, ISession } from '@crawlee/types';

export type SearchParams = string | URLSearchParams | Record<string, string | number | boolean | null | undefined>;

// TODO BC with got - remove the options and callback parameters in 4.0
interface ToughCookieJar {
    getCookieString: ((
        currentUrl: string,
        options: Record<string, unknown>,
        callback: (error: Error | null, cookies: string) => void,
    ) => string) &
        ((url: string, callback: (error: Error | null, cookieHeader: string) => void) => string);
    setCookie: ((
        cookieOrString: unknown,
        currentUrl: string,
        options: Record<string, unknown>,
        callback: (error: Error | null, cookie: unknown) => void,
    ) => void) &
        ((rawCookie: string, url: string, callback: (error: Error | null, result: unknown) => void) => void);
}

interface PromiseCookieJar {
    getCookieString: (url: string) => Promise<string>;
    setCookie: (rawCookie: string, url: string) => Promise<unknown>;
}

/**
 * HTTP Request as accepted by {@apilink BaseHttpClient} methods.
 */
export interface HttpRequest {
    url: string | URL;
    method?: AllowedHttpMethods;
    headers?: Headers;
    body?: Readable;

    signal?: AbortSignal;
    timeout?: number;

    cookieJar?: ToughCookieJar | PromiseCookieJar;
    followRedirect?: boolean | ((response: any) => boolean); // TODO BC with got - specify type better in 4.0
    maxRedirects?: number;

    encoding?: BufferEncoding;
    throwHttpErrors?: boolean;

    // from got-scraping Context
    proxyUrl?: string;
    headerGeneratorOptions?: Record<string, unknown>;
    useHeaderGenerator?: boolean;
    headerGenerator?: {
        getHeaders: (options: Record<string, unknown>) => Record<string, string>;
    };
    insecureHTTPParser?: boolean;
    sessionToken?: object;
}

/**
 * Additional options for HTTP requests that need to be handled separately before passing to {@apilink BaseHttpClient}.
 */
export interface HttpRequestOptions extends HttpRequest {
    /** Search (query string) parameters to be appended to the request URL */
    searchParams?: SearchParams;

    /** A form to be sent in the HTTP request body (URL encoding will be used) */
    form?: Record<string, string>;
    /** Artbitrary object to be JSON-serialized and sent as the HTTP request body */
    json?: unknown;

    /** Basic HTTP Auth username */
    username?: string;
    /** Basic HTTP Auth password */
    password?: string;
}

export interface IResponseWithUrl extends Response {
    url: string;
}

/**
 * Type of a function called when an HTTP redirect takes place. It is allowed to mutate the `updatedRequest` argument.
 */
export type RedirectHandler = (
    redirectResponse: Response,
    updatedRequest: { url?: string | URL; headers: Headers },
) => void;

export interface SendRequestOptions {
    session?: ISession;
    cookieJar?: ToughCookieJar;
    timeout?: number;
    /**
     * Overrides the proxy URL set in the `session` for this request.
     *
     * Note that setting this manually can interfere with session proxy rotation.
     */
    proxyUrl?: string;
}

export interface StreamOptions extends SendRequestOptions {
    onRedirect?: RedirectHandler;
}

/**
 * Interface for user-defined HTTP clients to be used for plain HTTP crawling and for sending additional requests during a crawl.
 */
export interface BaseHttpClient {
    /**
     * Perform an HTTP Request and return the complete response.
     */
    sendRequest(request: Request, options?: SendRequestOptions): Promise<Response>;

    /**
     * Perform an HTTP Request and return after the response headers are received. The body may be read from a stream contained in the response.
     */
    stream(request: Request, options?: StreamOptions): Promise<Response>;
}
