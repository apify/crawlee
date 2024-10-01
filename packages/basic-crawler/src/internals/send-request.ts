import type { Session, Request, HttpRequest, BaseHttpClient } from '@crawlee/core';
import { applySearchParams, type SearchParams } from '@crawlee/utils';
// @ts-expect-error This throws a compilation error due to got-scraping being ESM only but we only import types, so its alllll gooooood
import type { OptionsInit, Method, GotResponse } from 'got-scraping';

interface SendRequestOptions extends HttpRequest<any> {
    searchParams: SearchParams;
    form: Record<string, string>;
    json: unknown;
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
        { searchParams, form, json, ...overrideOptions }: Partial<SendRequestOptions> = {},
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

        if (
            [overrideOptions.body, overrideOptions.form, overrideOptions.json].filter((value) => value !== undefined)
                .length > 1
        ) {
            throw new Error('At most one of `body`, `form` and `json` may be specified in sendRequest arguments');
        }

        const body = (() => {
            if (form !== undefined) {
                return new URLSearchParams(form).toString();
            }

            if (json !== undefined) {
                return JSON.stringify(json);
            }

            if (overrideOptions.body !== undefined) {
                return overrideOptions.body;
            }

            return request.payload;
        })();

        const headers = { ...(overrideOptions.headers ?? request.headers) };

        if (form !== undefined) {
            headers['content-type'] ??= 'application/x-www-form-urlencoded';
        }

        if (json !== undefined) {
            headers['content-type'] ??= 'application/json';
        }

        return httpClient.sendRequest<any>({
            url,
            method: request.method as Method, // Narrow type to omit CONNECT
            proxyUrl: getProxyUrl(),
            sessionToken: session,
            responseType: 'text',
            ...overrideOptions,
            body,
            headers,
            cookieJar,
        });
    };
}
