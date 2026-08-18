import { Readable } from 'node:stream';
import { BaseHttpClient, ResponseWithUrl } from '@crawlee/http-client';
import { gotScraping } from 'got-scraping';
/**
 * A HTTP client implementation based on the `got-scraping` library.
 */
export class GotScrapingHttpClient extends BaseHttpClient {
    /**
     * Type guard that validates the HTTP method (excluding CONNECT).
     * @param request - The HTTP request to validate
     */
    validateRequest(request) {
        return !['CONNECT', 'connect'].includes(request.method);
    }
    *iterateHeaders(headers) {
        for (const [key, value] of Object.entries(headers)) {
            if (key.startsWith(':') || value === undefined)
                continue;
            if (Array.isArray(value)) {
                for (const v of value)
                    yield [key, v];
            }
            else {
                yield [key, value];
            }
        }
    }
    parseHeaders(headers) {
        return new Headers([...this.iterateHeaders(headers)]);
    }
    async fetch(request, options) {
        const { proxyUrl, redirect, ignoreTlsErrors } = options ?? {};
        if (!this.validateRequest(request)) {
            throw new Error(`The HTTP method CONNECT is not supported by the GotScrapingHttpClient.`);
        }
        const gotResult = await gotScraping({
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: request.body ? Readable.fromWeb(request.body) : undefined,
            proxyUrl,
            signal: options?.signal ?? undefined,
            followRedirect: redirect === 'follow',
            ...(ignoreTlsErrors ? { https: { rejectUnauthorized: false } } : {}),
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
