import type { BaseHttpClient, HttpRequest, HttpResponse, RedirectHandler, ResponseTypes, StreamingHttpResponse } from '@crawlee/core';
export declare class CustomHttpClient implements BaseHttpClient {
    sendRequest<TResponseType extends keyof ResponseTypes = 'text'>(request: HttpRequest<TResponseType>): Promise<HttpResponse<TResponseType>>;
    stream(request: HttpRequest, _onRedirect?: RedirectHandler): Promise<StreamingHttpResponse>;
}
