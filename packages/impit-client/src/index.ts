import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { isGeneratorObject } from 'node:util/types';

import { type BaseHttpClient, type HttpRequest, type ResponseTypes, ResponseWithUrl } from '@crawlee/core';
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

/**
 * A HTTP client implementation based on the `impit library.
 */
export class ImpitHttpClient implements BaseHttpClient {
    private impitOptions: ImpitOptions;
    private maxRedirects: number;
    private followRedirects: boolean;

    /**
     * Enables reuse of `impit` clients for the same set of options.
     * This is useful for performance reasons, as creating
     * a new client for each request breaks TCP connection
     * (and other resources) reuse.
     */
    private clientCache: LruCache<{ client: Impit; cookieJar: ToughCookieJar }> = new LruCache({ maxLength: 10 });

    private getClient(options: ImpitOptions) {
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

    constructor(options?: Omit<ImpitOptions, 'proxyUrl'> & { maxRedirects?: number }) {
        this.impitOptions = options ?? {};

        this.maxRedirects = options?.maxRedirects ?? 10;
        this.followRedirects = options?.followRedirects ?? true;
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

            return this.getResponse(
                {
                    ...request,
                    url: redirectUrl.href,
                },
                {
                    redirectCount: (redirects?.redirectCount ?? 0) + 1,
                    redirectUrls: [...(redirects?.redirectUrls ?? []), redirectUrl],
                },
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
        responseStream.on('data', (chunk) => {
            transferred += chunk.length;
        });

        const getDownloadProgress = () => {
            return {
                percent: Math.round((transferred / total) * 100),
                transferred,
                total,
            };
        };

        return [responseStream, getDownloadProgress];
    }

    /**
     * @inheritDoc
     */
    async stream(request: HttpRequest): Promise<Response> {
        const { response } = await this.getResponse(request);
        const [stream] = this.getStreamWithProgress(response);

        // Cast shouldn't be needed here, undici might have a slightly different `ReadableStream` type
        return new ResponseWithUrl(Readable.toWeb(stream) as any, response);
    }
}
