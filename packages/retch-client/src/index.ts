import { Readable } from 'stream';
import { isTypedArray } from 'util/types';

import type { HttpRequest, HttpResponse, ResponseTypes, StreamingHttpResponse, BaseHttpClient } from '@crawlee/core';
import { type RetcherOptions, type HttpMethod, Retcher } from 'retch-http';

/**
 * A HTTP client implementation based on the `retch-http` library.
 */
export class RetchHttpClient implements BaseHttpClient {
    private retcher: Retcher;

    constructor(options: RetcherOptions) {
        this.retcher = new Retcher(options);
    }

    /**
     * Converts the body of a `HttpRequest` to a format that can be passed to `retch-http`.
     *
     * `retch-http` currently expects the request body to be an array of numbers representing the bytes of the body (or undefined).
     * @param body
     * @returns
     */
    private async intoRetcherBody<TResponseType extends keyof ResponseTypes>(
        body: Exclude<HttpRequest<TResponseType>['body'], undefined>,
    ): Promise<number[]> {
        if (isTypedArray(body) || body instanceof ArrayBuffer) {
            return Array.from(new Uint8Array(body));
        }

        if (typeof body === 'string') {
            return Array.from(new TextEncoder().encode(body));
        }

        if (body instanceof ReadableStream) {
            const reader = body.getReader();
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                chunks.push(...Array.from(new Uint8Array(value)));
            }

            return chunks;
        }

        throw new Error('Unsupported request body type.');
    }

    private intoRecord<TResponseType extends keyof ResponseTypes>(
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

    private async performRequest<TResponseType extends keyof ResponseTypes>(
        request: HttpRequest<TResponseType>,
    ): Promise<HttpResponse<TResponseType>> {
        const url = typeof request.url === 'string' ? request.url : request.url.href;
        const headers = request.headers !== undefined ? this.intoRecord(request.headers) : undefined;
        const body = request.body !== undefined ? await this.intoRetcherBody(request.body) : undefined;

        const response = await this.retcher.fetch(url, {
            method: request.method as HttpMethod,
            headers,
            body,
            // fix - respect the proxy url!
        });

        let responseBody;

        switch (request.responseType) {
            case 'text':
                responseBody = response.text();
                break;
            case 'json':
                responseBody = response.json();
                break;
            case 'buffer':
                responseBody = response.bytes();
                break;
            default:
                throw new Error('Unsupported response type.');
        }

        return {
            headers: response.headers,
            statusCode: response.status,
            url,
            request,
            redirectUrls: [], // todo - https://github.com/retch-http/retch/issues/6
            trailers: {},
            body: responseBody,
            complete: true,
        };
    }

    /**
     * @inheritDoc
     */
    async sendRequest<TResponseType extends keyof ResponseTypes>(
        request: HttpRequest<TResponseType>,
    ): Promise<HttpResponse<TResponseType>> {
        return this.performRequest(request);
    }

    /**
     * @inheritDoc
     */
    async stream(request: HttpRequest): Promise<StreamingHttpResponse> {
        const response = await this.performRequest(request);

        const stream = new Readable();
        stream.push(response.response);
        stream.push(null);

        return {
            request,
            url: response.url,
            ip: response.ipAddress,
            statusCode: response.statusCode,
            stream,
            complete: true,
            downloadProgress: { percent: 100, transferred: response.response.length },
            uploadProgress: { percent: 100, transferred: 0 },
            redirectUrls: response.redirectUrls,
            headers: response.responseHeaders,
            trailers: {},
        };
    }
}
