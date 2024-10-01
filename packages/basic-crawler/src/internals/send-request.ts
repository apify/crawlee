import type { Session, Request, HttpRequest, BaseHttpClient } from '@crawlee/core';
// @ts-expect-error This throws a compilation error due to got-scraping being ESM only but we only import types, so its alllll gooooood
import type { OptionsInit, Method, GotResponse } from 'got-scraping';

interface SendRequestOptions extends HttpRequest<any> {
    searchParams: string | URLSearchParams | Record<string, string | number | boolean | null | undefined>;
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
        overrideOptions?: Partial<SendRequestOptions>,
    ): Promise<GotResponse<Response>> => {
        const cookieJar = session
            ? {
                  getCookieString: async (url: string) => session.getCookieString(url),
                  setCookie: async (rawCookie: string, url: string) => session.setCookie(rawCookie, url),
                  ...overrideOptions?.cookieJar,
              }
            : overrideOptions?.cookieJar;

        const url = new URL(request.url);

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
