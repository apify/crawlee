import { type BaseHttpClient, type Request, type Session } from '@crawlee/core';

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
    return async (): Promise<Response> => {
        return httpClient.sendRequest(originRequest.intoFetchAPIRequest(), { session, cookieJar: session?.cookieJar as any });
    };
}
