import {
    type BaseHttpClient,
    type HttpRequestOptions,
    processHttpRequestOptions,
    type Request,
    type Session,
} from '@crawlee/core';

/**
 * Prepares a function to be used as the `sendRequest` context helper.
 *
 * @internal
 * @param httpClient The HTTP client that will perform the requests.
 * @param originRequest The crawling request being processed.
 * @param session The user session associated with the current request.
 * @param getProxyUrl A function that will return the proxy URL that should be used for handling the request.
 */
export function createSendRequest(httpClient: BaseHttpClient, originRequest: Request, session: Session | undefined) {
    return async (overrideOptions: Partial<HttpRequestOptions> = {}): Promise<Response> => {
        const cookieJar = session
            ? {
                  getCookieString: async (url: string) => session.getCookieString(url),
                  setCookie: async (rawCookie: string, url: string) => session.setCookie(rawCookie, url),
                  ...overrideOptions?.cookieJar,
              }
            : overrideOptions?.cookieJar;

        const requestOptions = processHttpRequestOptions({
            url: originRequest.url,
            method: originRequest.method,
            headers: originRequest.headers,
            proxyUrl: session?.proxyInfo?.url,
            sessionToken: session,
            responseType: 'text',
            ...overrideOptions,
            cookieJar,
        });

        // Fill in body as the last step - `processHttpRequestOptions` may use either `body`, `json` or `form` so we cannot override it beforehand
        requestOptions.body ??= originRequest.payload;

        return httpClient.sendRequest(requestOptions);
    };
}
