import { Readable } from 'stream';
import { isTypedArray } from 'util/types';

import type { HttpRequest, HttpResponse, ResponseTypes, StreamingHttpResponse, BaseHttpClient } from '@crawlee/core';
import { type RetcherOptions, type HttpMethod, Retcher } from 'retch-http';

export { Browser } from 'retch-http';

/**
 * A HTTP client implementation based on the `retch-http` library.
 */
export class RetchHttpClient implements BaseHttpClient {
    private retcher: Retcher;

    constructor(options?: RetcherOptions) {
        this.retcher = new Retcher({
            ...(options ?? {}),
            followRedirects: false,
        });
    }

    /**
     * Converts the body of a `HttpRequest` to a format that can be passed to `retch-http`.
     *
     */
    private async intoRetcherBody<TResponseType extends keyof ResponseTypes>(
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
     * Flattens the headers of a `HttpRequest` to a format that can be passed to `retch-http`.
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
    private async performRequest<TResponseType extends keyof ResponseTypes>(
        request: HttpRequest<TResponseType>,
    ): Promise<HttpResponse<TResponseType>> {
        const url = typeof request.url === 'string' ? request.url : request.url.href;
        const headers = request.headers !== undefined ? this.flattenHeaders(request.headers) : undefined;
        const body = request.body !== undefined ? await this.intoRetcherBody(request.body) : undefined;

        const response = await this.retcher.fetch(url, {
            method: request.method as HttpMethod,
            headers,
            body: body as string,
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
            redirectUrls: [],
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
        stream.push(response.body);
        stream.push(null);

        return {
            request,
            url: response.url,
            ip: response.ipAddress,
            statusCode: response.statusCode,
            stream,
            complete: true,
            downloadProgress: { percent: 100, transferred: response.body.length },
            uploadProgress: { percent: 100, transferred: 0 },
            redirectUrls: response.redirectUrls,
            headers: response.headers,
            trailers: {},
        };
    }
}
