import { Readable } from 'node:stream';

import type { Options, PlainResponse } from 'got-scraping';
import { gotScraping } from 'got-scraping';

import type { BaseHttpClient, SendRequestOptions, StreamOptions } from './base-http-client.js';
import { ResponseWithUrl } from './base-http-client.js';

/**
 * A HTTP client implementation based on the `got-scraping` library.
 */
export class GotScrapingHttpClient implements BaseHttpClient {
    /**
     * Type guard that validates the HTTP method (excluding CONNECT).
     * @param request - The HTTP request to validate
     */
    private validateRequest(
        request: Request,
    ): request is Request & { method: Exclude<Request['method'], 'CONNECT' | 'connect'> } {
        return !['CONNECT', 'connect'].includes(request.method!);
    }

    private parseHeaders(headers: Record<string, string | string[] | undefined>): Headers {
        const filterPseudoheaders = (headerPair: string[]): boolean => {
            return !headerPair[0].startsWith(':');
        };

        const mergeMultipleHeaderValues = (header: [string, string | string[] | undefined]): string[][] => {
            const [key, value] = header;
            if (value === undefined) {
                return [];
            }

            if (Array.isArray(value)) {
                return value.map((v) => [key, v]);
            }
            return [[key, value]];
        };

        const parsedHeaders = Object.entries(headers)
            .map(mergeMultipleHeaderValues)
            .flat()
            .filter(filterPseudoheaders) as [string, string][];

        return new Headers(parsedHeaders);
    }

    /**
     * @inheritDoc
     */
    async sendRequest(request: Request, options?: SendRequestOptions): Promise<Response> {
        const { session, timeout } = options ?? {};

        if (!this.validateRequest(request)) {
            throw new Error(`The HTTP method CONNECT is not supported by the GotScrapingHttpClient.`);
        }

        const gotResult = await gotScraping({
            url: request.url!,
            method: request.method as Options['method'],
            headers: Object.fromEntries(request.headers.entries()),
            body: request.body ? Readable.fromWeb(request.body as any) : undefined,
            proxyUrl: session?.proxyInfo?.url,
            timeout: { request: timeout },
            // We set cookieJar to undefined because
            // `HttpCrawler` reads the cookies beforehand and sets them in `request.headers`.
            // Using the `cookieJar` option directly would override that.
            cookieJar: undefined,
        });

        const responseHeaders = this.parseHeaders(gotResult.headers);

        return new ResponseWithUrl(new Uint8Array(gotResult.rawBody), {
            headers: responseHeaders,
            status: gotResult.statusCode,
            statusText: gotResult.statusMessage ?? '',
            url: gotResult.url,
        });
    }

    /**
     * @inheritDoc
     */
    async stream(request: Request, options?: StreamOptions): Promise<Response> {
        const { session, timeout } = options ?? {};

        if (!this.validateRequest(request)) {
            throw new Error(`The HTTP method CONNECT is not supported by the GotScrapingHttpClient.`);
        }
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            const stream = gotScraping({
                url: request.url,
                method: request.method as Options['method'],
                headers: Object.fromEntries(request.headers.entries()),
                body: request.body ? Readable.fromWeb(request.body as any) : undefined,
                isStream: true,
                proxyUrl: session?.proxyInfo?.url,
                timeout: { request: timeout },
                cookieJar: undefined,
            });

            stream.on('redirect', (updatedOptions: Options, redirectResponse: any) => {
                const nativeRedirectResponse = new ResponseWithUrl(redirectResponse.rawBody, {
                    headers: redirectResponse.headers,
                    status: redirectResponse.statusCode,
                    statusText: redirectResponse.statusMessage,
                    url: redirectResponse.url,
                });

                const nativeHeaders = new Headers(
                    Object.entries(updatedOptions.headers)
                        .map(([key, value]) => (Array.isArray(value) ? value.map((v) => [key, v]) : [[key, value]]))
                        .flat() as [string, string][],
                );

                options?.onRedirect?.(nativeRedirectResponse, {
                    url: updatedOptions.url,
                    headers: nativeHeaders,
                });

                updatedOptions.headers = Object.fromEntries(nativeHeaders.entries());
            });

            // We need to end the stream for DELETE requests, otherwise it will hang.
            if (request.method && ['DELETE', 'delete'].includes(request.method)) {
                stream.end();
            }

            stream.on('error', reject);

            stream.on('response', (response: PlainResponse) => {
                const headers = this.parseHeaders(response.headers);
                // Cast shouldn't be needed here, undici might have a different `ReadableStream` type
                resolve(
                    new ResponseWithUrl(Readable.toWeb(stream) as any, {
                        status: response.statusCode,
                        statusText: response.statusMessage ?? '',
                        headers,
                        url: response.url,
                    }),
                );
            });
        });
    }
}
