import { Readable } from 'node:stream';

import type { AllowedHttpMethods } from '@crawlee/types';
import { applySearchParams, type SearchParams } from '@crawlee/utils';

import { Session } from '../session_pool/session.js';

/**
 * Maps permitted values of the `responseType` option on {@apilink HttpRequest} to the types that they produce.
 */
export interface ResponseTypes {
    'json': unknown;
    'text': string;
    'buffer': Buffer;
}

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

type SimpleHeaders = Record<string, string | string[] | undefined>;

/**
 * HTTP Request as accepted by {@apilink BaseHttpClient} methods.
 */
export interface HttpRequest<TResponseType extends keyof ResponseTypes = 'text'> {
    [k: string]: unknown; // TODO BC with got - remove in 4.0

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
    responseType?: TResponseType;
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
export interface HttpRequestOptions<TResponseType extends keyof ResponseTypes = 'text'>
    extends HttpRequest<TResponseType> {
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

export class ResponseWithUrl extends Response {
    override url: string;
    constructor(body: BodyInit | null, init: ResponseInit & { url?: string }) {
        super(body, init);
        this.url = init.url ?? '';
    }
}

/**
 * Type of a function called when an HTTP redirect takes place. It is allowed to mutate the `updatedRequest` argument.
 */
export type RedirectHandler = (
    redirectResponse: Response,
    updatedRequest: { url?: string | URL; headers: SimpleHeaders },
) => void;

export interface SendRequestOptions {
    session?: Session;
    cookieJar?: ToughCookieJar;
    timeout?: number;
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

/**
 * Converts {@apilink HttpRequestOptions} to a {@apilink HttpRequest}.
 */
export function processHttpRequestOptions<TResponseType extends keyof ResponseTypes = 'text'>({
    searchParams,
    form,
    json,
    username,
    password,
    ...request
}: HttpRequestOptions<TResponseType>): HttpRequest<TResponseType> {
    const url = new URL(request.url);
    const headers = new Headers(request.headers);

    applySearchParams(url, searchParams);

    if ([request.body, form, json].filter((value) => value !== undefined).length > 1) {
        throw new Error('At most one of `body`, `form` and `json` may be specified in sendRequest arguments');
    }

    const body = (() => {
        if (form !== undefined) {
            return Readable.from(new URLSearchParams(form).toString());
        }

        if (json !== undefined) {
            return Readable.from(JSON.stringify(json));
        }

        if (request.body !== undefined) {
            return Readable.from(request.body);
        }

        return undefined;
    })();

    if (form !== undefined && !headers.has('content-type')) {
        headers.set('content-type', 'application/x-www-form-urlencoded');
    }

    if (json !== undefined && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
    }

    if (username !== undefined || password !== undefined) {
        const encodedAuth = Buffer.from(`${username ?? ''}:${password ?? ''}`).toString('base64');
        headers.set('authorization', `Basic ${encodedAuth}`);
    }

    return { ...request, body, url, headers };
}
