import { ReadableStream } from 'node:stream/web';
import { Readable } from 'stream';
import { isTypedArray } from 'util/types';

import type { HttpRequest, HttpResponse, ResponseTypes, StreamingHttpResponse, BaseHttpClient } from '@crawlee/core';
import { type ImpitOptions, type HttpMethod, Impit, type ImpitResponse } from 'impit';

export { Browser } from 'impit';

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

    constructor(options?: Omit<ImpitOptions, 'proxyUrl'> & { maxRedirects?: number }) {
        this.impitOptions = options ?? {};

        this.maxRedirects = options?.maxRedirects ?? 10;
        this.followRedirects = options?.followRedirects ?? true;
    }

    /**
     * Converts the body of a `HttpRequest` to a format that can be passed to `impit`.
     */
    private async intoImpitBody<TResponseType extends keyof ResponseTypes>(
        body: Exclude<HttpRequest<TResponseType>['body'], undefined>,
    ): Promise<string | Uint8Array> {
        if (typeof body === 'string' || isTypedArray(body)) {
            return body;
        }

        if (body instanceof ReadableStream) {
            const reader = body.getReader();
            const buffer = new Uint8Array();

            while (true) {
                const { done, value } = await reader.read();

                if (done) return buffer;

                buffer.set(value, buffer.length);
            }
        }

        throw new Error('Unsupported body type.');
    }

    /**
     * Flattens the headers of a `HttpRequest` to a format that can be passed to `impit`.
     * @param headers `SimpleHeaders` object
     * @returns `Record<string, string>` object
     */
    private flattenHeaders<TResponseType extends keyof ResponseTypes>(
        headers: Exclude<HttpRequest<TResponseType>['headers'], undefined>,
    ): Record<string, string> {
        const result: Record<string, string> = {};

        for (const headerName of Object.keys(headers)) {
            const headerValue = headers[headerName];

            if (headerValue === undefined) continue;

            if (Array.isArray(headerValue)) {
                result[headerName] = headerValue[0];
                continue;
            }

            result[headerName] = headerValue;
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
    ): Promise<ResponseWithRedirects> {
        if ((redirects?.redirectCount ?? 0) > this.maxRedirects) {
            throw new Error(`Too many redirects, maximum is ${this.maxRedirects}.`);
        }

        const url = typeof request.url === 'string' ? request.url : request.url.href;
        const headers = request.headers !== undefined ? this.flattenHeaders(request.headers) : undefined;
        const body = request.body !== undefined ? await this.intoImpitBody(request.body) : undefined;

        const impit = new Impit({
            ...this.impitOptions,
            proxyUrl: request.proxyUrl,
            followRedirects: false,
        });

        const response = await impit.fetch(url, {
            method: request.method as HttpMethod,
            headers,
            body: body as string,
        });

        if (this.followRedirects && response.status >= 300 && response.status < 400) {
            const location = response.headers.location;

            if (!location) {
                throw new Error('Redirect response missing location header.');
            }

            return this.getResponse(
                {
                    ...request,
                    url: location,
                },
                {
                    redirectCount: (redirects?.redirectCount ?? 0) + 1,
                    redirectUrls: [...(redirects?.redirectUrls ?? []), new URL(location)],
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
            headers: response.headers,
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
        const total = Number(response.headers['content-length'] ?? 0);
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
            headers: response.headers,
            trailers: {},
        };
    }
}
