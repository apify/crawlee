import { gotScraping } from '@crawlee/utils';

import type { HttpRequest, HttpResponse, ResponseTypes } from './base_http_client';
import { BaseHttpClient } from './base_http_client';


export class GotScrapingHttpClient extends BaseHttpClient {
    override async sendRequest<TResponseType extends keyof ResponseTypes>(
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
}
