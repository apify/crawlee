import { BaseHttpClient, HttpRequest, HttpResponse, ResponseTypes } from './base_http_client';
import { gotScraping } from '@crawlee/utils';

export class GotScrapingHttpClient extends BaseHttpClient {
    override async sendRequest<TResponseType extends keyof ResponseTypes>(
        request: HttpRequest<TResponseType>,
    ): Promise<HttpResponse<TResponseType>> {
        return await gotScraping({
            ...request,
            retry: {
                limit: 0,
                ...(request.retry as Record<string, unknown> | undefined),
            },
        });
    }
}
