import { Readable } from 'node:stream';

import type { Options, PlainResponse } from 'got-scraping';
import { gotScraping } from 'got-scraping';

import {
    ResponseWithUrl,
    type BaseHttpClient,
    type HttpRequest,
    type RedirectHandler,
    type ResponseTypes,
} from './base-http-client.js';

/**
 * A HTTP client implementation based on the `got-scraping` library.
 */
export class GotScrapingHttpClient implements BaseHttpClient {
    /**
     * @inheritDoc
     */
    async sendRequest<TResponseType extends keyof ResponseTypes>(
        request: HttpRequest<TResponseType>,
    ): Promise<Response> {
        const gotResult = await gotScraping({
            ...request,
            retry: {
                limit: 0,
                ...(request.retry as Record<string, unknown> | undefined),
            },
        });

        const parsedHeaders = Object.entries(gotResult.headers)
            .map(([key, value]) => {
                if (value === undefined) return [];

                if (Array.isArray(value)) {
                    return value.map((v) => [key, v]);
                }

                return [[key, value]];
            })
            .flat() as [string, string][];

        return new ResponseWithUrl(new Uint8Array(gotResult.rawBody), {
            headers: new Headers(parsedHeaders),
            status: gotResult.statusCode,
            statusText: gotResult.statusMessage ?? '',
            url: gotResult.url,
        });
    }

    /**
     * @inheritDoc
     */
    async stream(request: HttpRequest, handleRedirect?: RedirectHandler): Promise<Response> {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            const stream = gotScraping({ ...request, isStream: true });

            stream.on('redirect', (updatedOptions: Options, redirectResponse: Response) => {
                // TODO - the types here likely don't match
                handleRedirect?.(redirectResponse, updatedOptions);
            });

            // We need to end the stream for DELETE requests, otherwise it will hang.
            if (request.method && ['DELETE', 'delete'].includes(request.method)) {
                stream.end();
            }

            stream.on('error', reject);

            stream.on('response', (response: PlainResponse) => {
                // Cast shouldn't be needed here, undici might have a different `ReadableStream` type
                resolve(
                    new ResponseWithUrl(Readable.toWeb(stream) as any, {
                        status: response.statusCode,
                        statusText: response.statusMessage ?? '',
                        headers: response.headers as HeadersInit,
                        url: response.url,
                    }),
                );
            });
        });
    }
}
