import { Readable } from 'node:stream';

import type { Request as CrawleeRequest } from '@crawlee/core';
import type { BaseHttpClient } from '@crawlee/http-client';
import type { ISession, SendRequestOptions, SendRequestOverrides } from '@crawlee/types';
import { processHttpRequestOptions } from '@crawlee/utils/internal';

/**
 * Prepares a function to be used as the `sendRequest` context helper.
 *
 * @internal
 * @param httpClient The HTTP client that will perform the requests.
 * @param originRequest The crawling request being processed.
 * @param session The user session associated with the current request.
 */
export function createSendRequest(httpClient: BaseHttpClient, originRequest: CrawleeRequest, session: ISession) {
    return async (
        overrideRequest: SendRequestOverrides = {},
        overrideOptions: SendRequestOptions = {},
    ): Promise<Response> => {
        const baseRequest = originRequest.intoFetchAPIRequest();

        const mergedHeaders = new Headers(baseRequest.headers);
        new Headers(overrideRequest.headers).forEach((value, key) => {
            mergedHeaders.set(key, value);
        });

        const opts = processHttpRequestOptions({
            ...overrideRequest,
            url: overrideRequest.url ?? baseRequest.url,
            method: overrideRequest.method ?? originRequest.method,
            headers: mergedHeaders,
            body: overrideRequest.body === undefined ? undefined : Readable.from(overrideRequest.body),
        });

        const request = new Request(opts.url, {
            method: opts.method,
            headers: opts.headers,
            body: opts.body ? Readable.toWeb(opts.body) : baseRequest.body,
            redirect: opts.followRedirect === false ? 'manual' : 'follow',
            // Node-specific option to make the request body work with streams
            duplex: 'half',
        } as RequestInit);

        return httpClient.sendRequest(request, {
            session,
            cookieJar: overrideOptions.cookieJar ?? opts.cookieJar ?? session.cookieJar,
            proxyUrl: overrideOptions.proxyUrl ?? opts.proxyUrl,
            timeoutMillis: overrideOptions.timeoutMillis ?? opts.timeout,
            signal: overrideOptions.signal ?? opts.signal,
            ignoreTlsErrors: overrideOptions.ignoreTlsErrors,
        });
    };
}
