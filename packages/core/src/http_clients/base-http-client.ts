import type { Readable } from 'node:stream';

import { applySearchParams, type SearchParams } from '@crawlee/utils';

import type { FormDataLike } from './form-data-like.js';

type Timeout =
    | {
          lookup: number;
          connect: number;
          secureConnect: number;
          socket: number;
          send: number;
          response: number;
      }
    | { request: number };

type Method =
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'HEAD'
    | 'DELETE'
    | 'OPTIONS'
    | 'TRACE'
    | 'get'
    | 'post'
    | 'put'
    | 'patch'
    | 'head'
    | 'delete'
    | 'options'
    | 'trace';

/**
 * Maps permitted values of the `responseType` option on {@apilink HttpRequest} to the types that they produce.
 */
export interface ResponseTypes {
    'json': unknown;
    'text': string;
    'buffer': Buffer;
}

interface Progress {
    percent: number;
    transferred: number;
    total?: number;
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
    method?: Method;
    headers?: SimpleHeaders;
    body?: string | Buffer | Readable | Generator | AsyncGenerator | FormDataLike;

    signal?: AbortSignal;
    timeout?: Partial<Timeout>;

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

/**
 * HTTP response data, without a body, as returned by {@apilink BaseHttpClient} methods.
 */
export interface BaseHttpResponseData {
    redirectUrls: URL[];
    url: string;

    ip?: string;
    statusCode: number;
    statusMessage?: string;

    headers: SimpleHeaders;
    trailers: SimpleHeaders; // Populated after the whole message is processed

    complete: boolean;
}

interface HttpResponseWithoutBody<TResponseType extends keyof ResponseTypes = keyof ResponseTypes>
    extends BaseHttpResponseData {
    request: HttpRequest<TResponseType>;
}

/**
 * HTTP response data as returned by the {@apilink BaseHttpClient.sendRequest} method.
 */
export interface HttpResponse<TResponseType extends keyof ResponseTypes = keyof ResponseTypes>
    extends HttpResponseWithoutBody<TResponseType> {
    [k: string]: any; // TODO BC with got - remove in 4.0

    body: ResponseTypes[TResponseType];
}

/**
 * HTTP response data as returned by the {@apilink BaseHttpClient.stream} method.
 */
export interface StreamingHttpResponse extends HttpResponseWithoutBody {
    stream: Readable;
    readonly downloadProgress: Progress;
    readonly uploadProgress: Progress;
}

/**
 * Type of a function called when an HTTP redirect takes place. It is allowed to mutate the `updatedRequest` argument.
 */
export type RedirectHandler = (
    redirectResponse: BaseHttpResponseData,
    updatedRequest: { url?: string | URL; headers: SimpleHeaders },
) => void;

/**
 * Interface for user-defined HTTP clients to be used for plain HTTP crawling and for sending additional requests during a crawl.
 */
export interface BaseHttpClient {
    /**
     * Perform an HTTP Request and return the complete response.
     */
    sendRequest<TResponseType extends keyof ResponseTypes = 'text'>(
        request: HttpRequest<TResponseType>,
    ): Promise<HttpResponse<TResponseType>>;

    /**
     * Perform an HTTP Request and return after the response headers are received. The body may be read from a stream contained in the response.
     */
    stream(request: HttpRequest, onRedirect?: RedirectHandler): Promise<StreamingHttpResponse>;
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
    const headers = { ...request.headers };

    applySearchParams(url, searchParams);

    if ([request.body, form, json].filter((value) => value !== undefined).length > 1) {
        throw new Error('At most one of `body`, `form` and `json` may be specified in sendRequest arguments');
    }

    const body = (() => {
        if (form !== undefined) {
            return new URLSearchParams(form).toString();
        }

        if (json !== undefined) {
            return JSON.stringify(json);
        }

        return request.body;
    })();

    if (form !== undefined) {
        headers['content-type'] ??= 'application/x-www-form-urlencoded';
    }

    if (json !== undefined) {
        headers['content-type'] ??= 'application/json';
    }

    if (username !== undefined || password !== undefined) {
        const encodedAuth = Buffer.from(`${username ?? ''}:${password ?? ''}`).toString('base64');
        headers.authorization = `Basic ${encodedAuth}`;
    }

    return { ...request, body, url, headers };
}
