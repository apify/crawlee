import { Readable } from 'node:stream';
import { type ReadableStream } from 'node:stream/web';
import { isGeneratorObject } from 'node:util/types';

import type { BaseHttpClient, HttpRequest, HttpResponse, ResponseTypes, StreamingHttpResponse } from '@crawlee/core';
import type { HttpMethod, ImpitOptions, ImpitResponse, RequestInit } from 'impit';
import { Impit } from 'impit';

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
    private clientCache: LruCache<Impit> = new LruCache({ maxLength: 10 });

    private getClient(options: ImpitOptions) {
        const cacheKey = JSON.stringify(options);

        if (this.clientCache.get(cacheKey)) {
            return this.clientCache.get(cacheKey)!;
        }

        const client = new Impit(options);
        this.clientCache.add(cacheKey, client);

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
            proxyUrl: request.proxyUrl,
            followRedirects: false,
        });

        const response = await impit.fetch(url, {
            method: request.method as HttpMethod,
            headers: this.intoHeaders(request.headers),
            body: this.intoImpitBody(request.body),
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
    ): Promise<HttpResponse<TResponseType>> {
        const { response, redirectUrls } = await this.getResponse(request);

        let responseBody;

        switch (request.responseType) {
            case 'text':
                responseBody = await response.text();
                break;
            case 'json':
                responseBody = await response.json();
                break;
            case 'buffer':
                responseBody = await response.bytes();
                break;
            default:
                throw new Error('Unsupported response type.');
        }

        return {
            headers: Object.fromEntries(response.headers.entries()),
            statusCode: response.status,
            url: response.url,
            request,
            redirectUrls,
            trailers: {},
            body: responseBody,
            complete: true,
        };
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
    async stream(request: HttpRequest): Promise<StreamingHttpResponse> {
        const { response, redirectUrls } = await this.getResponse(request);
        const [stream, getDownloadProgress] = this.getStreamWithProgress(response);

        return {
            request,
            url: response.url,
            statusCode: response.status,
            stream,
            complete: true,
            get downloadProgress() {
                return getDownloadProgress();
            },
            uploadProgress: { percent: 100, transferred: 0 },
            redirectUrls,
            headers: Object.fromEntries(response.headers.entries()),
            trailers: {},
        };
    }
}
