import type { Request as CrawleeRequest, Session } from '@crawlee/core';
import type { BaseHttpClient, HttpRequestOptions, SendRequestOptions } from '@crawlee/types';

/**
 * Prepares a function to be used as the `sendRequest` context helper.
 *
 * @internal
 * @param httpClient The HTTP client that will perform the requests.
 * @param originRequest The crawling request being processed.
 * @param session The user session associated with the current request.
 */
export function createSendRequest(
    httpClient: BaseHttpClient,
    originRequest: CrawleeRequest,
    session: Session | undefined,
) {
    return async (
        requestOverrides: Partial<HttpRequestOptions> = {},
        optionsOverrides: SendRequestOptions = {},
    ): Promise<Response> => {
        const baseRequest = originRequest.intoFetchAPIRequest();
        const mergedUrl = requestOverrides.url ?? baseRequest.url;
        const mergedMethod = requestOverrides.method ?? baseRequest.method;

        const mergedHeaders = new Headers(baseRequest.headers);
        if (requestOverrides.headers) {
            requestOverrides.headers.forEach((value, key) => {
                mergedHeaders.set(key, value);
            });
        }

        const request = new Request(mergedUrl, {
            method: mergedMethod,
            headers: mergedHeaders,
            body: requestOverrides.body ?? baseRequest.body,
        } as RequestInit);

        return httpClient.sendRequest(request, {
            session,
            cookieJar: optionsOverrides?.cookieJar ?? (session?.cookieJar as any),
            timeout: optionsOverrides.timeout,
        });
    };
}
