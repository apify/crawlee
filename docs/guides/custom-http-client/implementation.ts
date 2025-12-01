import type {
    BaseHttpClient,
    HttpRequest,
    HttpResponse,
    RedirectHandler,
    ResponseTypes,
    StreamingHttpResponse,
} from '@crawlee/core';
import { Readable } from 'node:stream';

export class CustomHttpClient implements BaseHttpClient {
    async sendRequest<TResponseType extends keyof ResponseTypes = 'text'>(
        request: HttpRequest<TResponseType>,
    ): Promise<Response> {
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

        return fetch(request.url, {
            method: request.method,
            headers: requestHeaders,
            body: request.body as string,
            signal: request.signal,
        });
    }

    async stream(request: HttpRequest, _onRedirect?: RedirectHandler): Promise<Response> {
        return fetch(request.url, {
            method: request.method,
            headers: new Headers(),
            body: request.body as string,
            signal: request.signal,
        });
    }
}
