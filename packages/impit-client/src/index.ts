import { pipeline, Readable, Transform } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { isGeneratorObject } from 'node:util/types';

import {
    type BaseHttpClient,
    type HttpRequest,
    type RedirectHandler,
    type ResponseTypes,
    ResponseWithUrl,
} from '@crawlee/core';
import type { HttpMethod, ImpitOptions, ImpitResponse, RequestInit } from 'impit';
import { Impit } from 'impit';
import type { CookieJar as ToughCookieJar } from 'tough-cookie';

import { LruCache } from '@apify/datastructures';

export const Browser = {
    'Chrome': 'chrome',
    'Firefox': 'firefox',
} as const;

interface ResponseWithRedirects {
    response: ImpitResponse;
    redirectUrls: URL[];
}

type SimpleHeaders = Record<string, string | string[] | undefined>;

/**
 * A HTTP client implementation based on the `impit library.
 */
export class ImpitHttpClient implements BaseHttpClient {
    private impitOptions: ImpitOptions;
    private maxRedirects: number;
    private followRedirects: boolean;
    private cacheClients: boolean;

    /**
     * Enables reuse of `impit` clients for the same set of options.
     * This is useful for performance reasons, as creating
     * a new client for each request breaks TCP connection
     * (and other resources) reuse.
     */
    private clientCache: LruCache<{ client: Impit; cookieJar: ToughCookieJar }> = new LruCache({ maxLength: 10 });

    private getClient(options: ImpitOptions): Impit {
        if (!this.cacheClients) {
            return new Impit(options);
        }

        const { cookieJar, ...rest } = options;

        const cacheKey = JSON.stringify(rest);
        const existingClient = this.clientCache.get(cacheKey);

        if (existingClient && (!cookieJar || existingClient.cookieJar === cookieJar)) {
            return existingClient.client;
        }

        const client = new Impit(options);
        this.clientCache.add(cacheKey, { client, cookieJar: cookieJar as ToughCookieJar });

        return client;
    }

    /**
     * @param options.cacheClients Whether to cache `impit` clients between requests. Defaults to `true`.
     */
    constructor(options?: Omit<ImpitOptions, 'proxyUrl'> & { maxRedirects?: number; cacheClients?: boolean }) {
        const { maxRedirects = 10, followRedirects = true, cacheClients = true, ...impitOptions } = options ?? {};

        this.impitOptions = impitOptions;
        this.maxRedirects = maxRedirects;
        this.followRedirects = followRedirects;
        this.cacheClients = cacheClients;
    }

    /**
     * Flattens the headers of a `HttpRequest` to a format that can be passed to `impit`.
     * @param headers `SimpleHeaders` object
     * @returns `Record<string, string>` object
     */
    private intoHeaders<TResponseType extends keyof ResponseTypes>(
        headers?: Exclude<HttpRequest<TResponseType>['headers'], undefined>,
    ): Headers | undefined {
        if (!headers) {
            return undefined;
        }

        const result = new Headers();

        for (const headerName of Object.keys(headers)) {
            const headerValue = headers[headerName];

            for (const value of Array.isArray(headerValue) ? headerValue : [headerValue]) {
                if (value === undefined) continue;

                result.append(headerName, value);
            }
        }

        return result;
    }

    private intoImpitBody<TResponseType extends keyof ResponseTypes>(
        body?: Exclude<HttpRequest<TResponseType>['body'], undefined>,
    ): RequestInit['body'] {
        if (isGeneratorObject(body)) {
            return Readable.toWeb(Readable.from(body)) as any;
        }
        if (body instanceof Readable) {
            return Readable.toWeb(body) as any;
        }

        return body as any;
    }

    private shouldRewriteRedirectToGet(httpStatus: number, method: HttpRequest<any>['method']): boolean {
        // See https://github.com/mozilla-firefox/firefox/blob/911b3eec6c5e58a9a49e23aa105e49aa76e00f9c/netwerk/protocol/http/HttpBaseChannel.cpp#L4801
        if ([301, 302].includes(httpStatus)) {
            return method === 'POST';
        }

        if (httpStatus === 303) return method !== 'HEAD';

        return false;
    }

    /**
     * Converts Fetch/Impit headers into a simple header map.
     * `Object.fromEntries` would keep only the last `set-cookie` value, so those are collected separately.
     */
    private intoSimpleHeaders(headers: Headers): SimpleHeaders {
        const result: SimpleHeaders = {};

        for (const [key, value] of headers.entries()) {
            if (key === 'set-cookie') continue;
            result[key] = value;
        }

        const setCookies = headers.getSetCookie();

        if (setCookies.length > 0) {
            result['set-cookie'] = setCookies.length === 1 ? setCookies[0] : setCookies;
        }

        return result;
    }

    /**
     * Common implementation for `sendRequest` and `stream` methods.
     * @param request `HttpRequest` object
     * @returns `HttpResponse` object
     */
    private async getResponse<TResponseType extends keyof ResponseTypes>(
        request: HttpRequest<TResponseType>,
        redirects?: {
            redirectCount?: number;
            redirectUrls?: URL[];
        },
        onRedirect?: RedirectHandler,
    ): Promise<ResponseWithRedirects> {
        if ((redirects?.redirectCount ?? 0) > this.maxRedirects) {
            throw new Error(`Too many redirects, maximum is ${this.maxRedirects}.`);
        }

        const url = typeof request.url === 'string' ? request.url : request.url.href;

        const impit = this.getClient({
            ...this.impitOptions,
            ...(request?.cookieJar ? { cookieJar: request.cookieJar as ToughCookieJar } : {}),
            proxyUrl: request.proxyUrl,
            followRedirects: false,
        });

        const response = await impit.fetch(url, {
            method: request.method as HttpMethod,
            headers: this.intoHeaders(request.headers),
            body: this.intoImpitBody(request.body),
            timeout: (request.timeout as { request?: number })?.request,
        });

        if (this.followRedirects && response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            const redirectUrl = new URL(location ?? '', request.url);

            if (!location) {
                throw new Error('Redirect response missing location header.');
            }

            const nextRedirectUrls = [...(redirects?.redirectUrls ?? []), redirectUrl];
            const updatedRequest: { url?: string | URL; headers: SimpleHeaders } = {
                url: redirectUrl.href,
                headers: { ...(request.headers ?? {}) },
            };

            // Match GotScrapingHttpClient: allow HttpCrawler to persist redirect cookies into the session
            // and mutate Cookie / URL for the next hop.
            onRedirect?.(
                {
                    redirectUrls: nextRedirectUrls,
                    url,
                    statusCode: response.status,
                    statusMessage: response.statusText,
                    headers: this.intoSimpleHeaders(response.headers),
                    trailers: {},
                    complete: true,
                },
                updatedRequest,
            );

            const nextUrl =
                typeof updatedRequest.url === 'string'
                    ? updatedRequest.url
                    : (updatedRequest.url?.href ?? redirectUrl.href);

            return this.getResponse(
                {
                    ...request,
                    method: this.shouldRewriteRedirectToGet(response.status, request.method) ? 'GET' : request.method,
                    url: nextUrl,
                    headers: updatedRequest.headers,
                },
                {
                    redirectCount: (redirects?.redirectCount ?? 0) + 1,
                    redirectUrls: nextRedirectUrls,
                },
                onRedirect,
            );
        }

        return {
            response,
            redirectUrls: redirects?.redirectUrls ?? [],
        };
    }

    /**
     * @inheritDoc
     */
    async sendRequest<TResponseType extends keyof ResponseTypes>(
        request: HttpRequest<TResponseType>,
    ): Promise<Response> {
        const { response } = await this.getResponse(request);

        // todo - cast shouldn't be needed here, impit returns `Uint8Array`
        return new ResponseWithUrl((await response.bytes()) as any, response);
    }

    private getStreamWithProgress(
        response: ImpitResponse,
    ): [Readable, () => { percent: number; transferred: number; total: number }] {
        const responseStream = Readable.fromWeb(response.body as ReadableStream<any>);
        let transferred = 0;
        const total = Number(response.headers.get('content-length') ?? 0);
        const counter = new Transform({
            transform(chunk, _enc, cb) {
                transferred += chunk.length;
                cb(null, chunk);
            },
        });

        pipeline(responseStream, counter, (err) => {
            if (err) counter.destroy(err);
        });

        const getDownloadProgress = () => ({
            percent: total > 0 ? Math.round((transferred / total) * 100) : 0,
            transferred,
            total,
        });

        return [counter, getDownloadProgress];
    }

    /**
     * @inheritDoc
     */
    async stream(request: HttpRequest, onRedirect?: RedirectHandler): Promise<Response> {
        const { response } = await this.getResponse(request, undefined, onRedirect);
        const [stream] = this.getStreamWithProgress(response);

        // Cast shouldn't be needed here, undici might have a slightly different `ReadableStream` type
        return new ResponseWithUrl(Readable.toWeb(stream) as any, response);
    }
}
