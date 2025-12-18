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
        overrideRequest: Partial<HttpRequestOptions> = {},
        overrideOptions: SendRequestOptions = {},
    ): Promise<Response> => {
        const sessionCookieJar = {
            getCookieString: async (url: string) => session?.getCookieString(url),
            setCookie: async (rawCookie: string, url: string) => session?.setCookie(rawCookie, url),
        };

        const baseRequest = originRequest.intoFetchAPIRequest();
        const mergedUrl = overrideRequest.url ?? baseRequest.url;
        const mergedMethod = overrideRequest.method ?? baseRequest.method;

        const mergedHeaders = new Headers(baseRequest.headers);
        if (overrideRequest.headers) {
            overrideRequest.headers.forEach((value, key) => {
                mergedHeaders.set(key, value);
            });
        }

        const request = new Request(mergedUrl, {
            method: mergedMethod,
            headers: mergedHeaders,
            body: overrideRequest.body ?? baseRequest.body,
        } as RequestInit);

        return httpClient.sendRequest(request, {
            session,
            cookieJar: overrideOptions?.cookieJar ?? (sessionCookieJar as any),
            timeout: overrideOptions.timeout,
        });
    };
}
