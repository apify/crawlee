import {
    BaseHttpClient,
    HttpRequest,
    HttpResponse,
    RedirectHandler,
    ResponseTypes,
    StreamingHttpResponse,
} from '@crawlee/core';

class CustomHttpClient implements BaseHttpClient {
    async sendRequest<TResponseType extends keyof ResponseTypes = 'text'>(
        request: HttpRequest<TResponseType>,
    ): Promise<HttpResponse<TResponseType>> {
        /* ... */
    }

    async stream(request: HttpRequest, onRedirect?: RedirectHandler): Promise<StreamingHttpResponse> {
        /* ... */
    }
}
