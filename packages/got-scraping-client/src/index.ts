import { Readable } from 'node:stream';

import { gotScraping, type Options } from 'got-scraping';
import { BaseHttpClient, type CustomFetchOptions, ResponseWithUrl } from '@crawlee/http-client';

/**
 * A HTTP client implementation based on the `got-scraping` library.
 */
export class GotScrapingHttpClient extends BaseHttpClient {
    /**
     * Type guard that validates the HTTP method (excluding CONNECT).
     * @param request - The HTTP request to validate
     */
    private validateRequest(
        request: Request,
    ): request is Request & { method: Exclude<Request['method'], 'CONNECT' | 'connect'> } {
        return !['CONNECT', 'connect'].includes(request.method!);
    }

    private *iterateHeaders(
        headers: Record<string, string | string[] | undefined>,
    ): Generator<[string, string], void, unknown> {
        for (const [key, value] of Object.entries(headers)) {
            if (key.startsWith(':') || value === undefined) continue;
            if (Array.isArray(value)) {
                for (const v of value) yield [key, v];
            } else {
                yield [key, value];
            }
        }
    }

    private parseHeaders(headers: Record<string, string | string[] | undefined>): Headers {
        return new Headers([...this.iterateHeaders(headers)]);
    }

    override async fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response> {
        const { proxyUrl, redirect } = options ?? {};

        if (!this.validateRequest(request)) {
            throw new Error(`The HTTP method CONNECT is not supported by the GotScrapingHttpClient.`);
        }

        const gotResult = await gotScraping({
            url: request.url!,
            method: request.method as Options['method'],
            headers: Object.fromEntries(request.headers.entries()),
            body: request.body ? Readable.fromWeb(request.body as any) : undefined,
            proxyUrl: proxyUrl,
            signal: options?.signal ?? undefined,
            followRedirect: redirect === 'follow',
        });

        const responseHeaders = this.parseHeaders(gotResult.headers);

        return new ResponseWithUrl(new Uint8Array(gotResult.rawBody), {
            headers: responseHeaders,
            status: gotResult.statusCode,
            statusText: gotResult.statusMessage ?? '',
            url: gotResult.url,
        });
    }
}
