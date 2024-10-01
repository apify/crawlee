import { gotScraping } from '@crawlee/utils';
// @ts-expect-error This throws a compilation error due to got-scraping being ESM only but we only import types, so its alllll gooooood
import type { Options, PlainResponse } from 'got-scraping';

import type {
    HttpRequest,
    HttpResponse,
    RedirectHandler,
    ResponseTypes,
    StreamingHttpResponse,
    BaseHttpClient,
} from './base_http_client';

export class GotScrapingHttpClient implements BaseHttpClient {
    async sendRequest<TResponseType extends keyof ResponseTypes>(
        request: HttpRequest<TResponseType>,
    ): Promise<HttpResponse<TResponseType>> {
        const gotResult = await gotScraping({
            ...request,
            retry: {
                limit: 0,
                ...(request.retry as Record<string, unknown> | undefined),
            },
        });

        return {
            ...gotResult,
            body: gotResult.body as ResponseTypes[TResponseType],
            request: { url: request.url, ...gotResult.request },
        };
    }

    async stream(request: HttpRequest, handleRedirect?: RedirectHandler): Promise<StreamingHttpResponse> {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            const stream = await Promise.resolve(gotScraping({ ...request, isStream: true }));

            stream.on('redirect', (updatedOptions: Options, redirectResponse: PlainResponse) => {
                handleRedirect?.(redirectResponse, updatedOptions);
            });

            // We need to end the stream for DELETE requests, otherwise it will hang.
            if (request.method && ['DELETE', 'delete'].includes(request.method)) {
                stream.end();
            }

            stream.on('error', reject);

            stream.on('response', (response: PlainResponse) => {
                const result: StreamingHttpResponse = {
                    stream,
                    request,
                    redirectUrls: response.redirectUrls,
                    url: response.url,
                    ip: response.ip,
                    statusCode: response.statusCode,
                    headers: response.headers,
                    trailers: response.trailers,
                    complete: response.complete,
                    get downloadProgress() {
                        return stream.downloadProgress;
                    },
                    get uploadProgress() {
                        return stream.uploadProgress;
                    },
                };

                Object.assign(result, response); // TODO BC - remove in 4.0

                resolve(result);

                stream.on('end', () => {
                    result.complete = response.complete;

                    result.trailers ??= {};
                    Object.assign(result.trailers, response.trailers);

                    (result as any).rawTrailers ??= []; // TODO BC - remove in 4.0
                    Object.assign((result as any).rawTrailers, response.rawTrailers);
                });
            });
        });
    }
}
