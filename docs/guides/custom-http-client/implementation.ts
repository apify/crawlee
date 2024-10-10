import {
    BaseHttpClient,
    HttpRequest,
    HttpResponse,
    RedirectHandler,
    ResponseTypes,
    StreamingHttpResponse,
} from '@crawlee/core';
import { Readable } from 'node:stream';

class CustomHttpClient implements BaseHttpClient {
    async sendRequest<TResponseType extends keyof ResponseTypes = 'text'>(
        request: HttpRequest<TResponseType>,
    ): Promise<HttpResponse<TResponseType>> {
        const requestHeaders = new Headers();
        for (let [headerName, headerValues] of Object.entries(request.headers ?? {})) {
            if (headerValues === undefined) {
                continue;
            }

            if (!Array.isArray(headerValues)) {
                headerValues = [headerValues];
            }

            for (const value of headerValues) {
                requestHeaders.append(headerName, value);
            }
        }

        const response = await fetch(request.url, {
            method: request.method,
            headers: requestHeaders,
            body: request.body as string, // TODO implement stream/generator handling
            signal: request.signal,
            // TODO implement the rest of request parameters (e.g., timeout, proxyUrl, cookieJar, ...)
        });

        const headers: Record<string, string> = {};

        response.headers.forEach((value, headerName) => {
            headers[headerName] = value;
        });

        return {
            complete: true,
            request,
            url: response.url,
            statusCode: response.status,
            redirectUrls: [], // TODO you need to handle redirects manually to track them
            headers,
            trailers: {}, // TODO not supported by fetch
            ip: undefined,
            body:
                request.responseType === 'text'
                    ? await response.text()
                    : request.responseType === 'json'
                      ? await response.json()
                      : Buffer.from(await response.text()),
        };
    }

    async stream(request: HttpRequest, onRedirect?: RedirectHandler): Promise<StreamingHttpResponse> {
        const fetchResponse = await fetch(request.url, {
            method: request.method,
            headers: new Headers(),
            body: request.body as string, // TODO implement stream/generator handling
            signal: request.signal,
            // TODO implement the rest of request parameters (e.g., timeout, proxyUrl, cookieJar, ...)
        });

        const headers: Record<string, string> = {}; // TODO same as in sendRequest()

        async function* read() {
            const reader = fetchResponse.body?.getReader();

            const stream = new ReadableStream({
                start(controller) {
                    if (!reader) {
                        return null;
                    }
                    return pump();
                    function pump() {
                        return reader!.read().then(({ done, value }) => {
                            // When no more data needs to be consumed, close the stream
                            if (done) {
                                controller.close();
                                return;
                            }
                            // Enqueue the next data chunk into our target stream
                            controller.enqueue(value);
                            return pump();
                        });
                    }
                },
            });

            for await (const chunk of stream) {
                yield chunk;
            }
        }

        const response = {
            complete: false,
            request,
            url: fetchResponse.url,
            statusCode: fetchResponse.status,
            redirectUrls: [], // TODO you need to handle redirects manually to track them
            headers,
            trailers: {}, // TODO not supported by fetch
            ip: undefined,
            stream: Readable.from(read()),
            get downloadProgress() {
                return { percent: 0, transferred: 0 }; // TODO track this
            },
            get uploadProgress() {
                return { percent: 0, transferred: 0 }; // TODO track this
            },
        };

        return response;
    }
}
