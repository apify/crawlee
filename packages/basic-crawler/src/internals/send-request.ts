import type { Session, Request, HttpRequest, BaseHttpClient } from '@crawlee/core';
import { applySearchParams, type SearchParams } from '@crawlee/utils';
// @ts-expect-error This throws a compilation error due to got-scraping being ESM only but we only import types, so its alllll gooooood
import type { OptionsInit, Method, GotResponse } from 'got-scraping';

interface SendRequestOptions extends HttpRequest<any> {
    searchParams: SearchParams;
}

/**
 * @internal
 */
export function createSendRequest(
    httpClient: BaseHttpClient,
    request: Request,
    session: Session | undefined,
    getProxyUrl: () => string | undefined,
) {
    return async <Response = string>(
        // TODO the type information here (and in crawler_commons) is outright wrong... for BC - replace this with generic HttpResponse in v4
        { searchParams, ...overrideOptions }: Partial<SendRequestOptions> = {},
    ): Promise<GotResponse<Response>> => {
        const cookieJar = session
            ? {
                  getCookieString: async (url: string) => session.getCookieString(url),
                  setCookie: async (rawCookie: string, url: string) => session.setCookie(rawCookie, url),
                  ...overrideOptions?.cookieJar,
              }
            : overrideOptions?.cookieJar;

        const url = new URL(request.url);
        applySearchParams(url, searchParams);

        return httpClient.sendRequest<any>({
            url,
            method: request.method as Method, // Narrow type to omit CONNECT
            body: request.payload,
            headers: request.headers,
            proxyUrl: getProxyUrl(),
            sessionToken: session,
            responseType: 'text',
            ...overrideOptions,
            cookieJar,
        });
    };
}
