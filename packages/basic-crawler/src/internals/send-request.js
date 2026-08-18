/**
 * Prepares a function to be used as the `sendRequest` context helper.
 *
 * @internal
 * @param httpClient The HTTP client that will perform the requests.
 * @param originRequest The crawling request being processed.
 * @param session The user session associated with the current request.
 */
export function createSendRequest(httpClient, originRequest, session) {
    return async (overrideRequest = {}, overrideOptions = {}) => {
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
        });
        return httpClient.sendRequest(request, {
            session,
            cookieJar: overrideOptions?.cookieJar ?? session.cookieJar,
            timeoutMillis: overrideOptions.timeoutMillis,
            signal: overrideOptions.signal,
            ignoreTlsErrors: overrideOptions.ignoreTlsErrors,
        });
    };
}
