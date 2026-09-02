import { BaseHttpClient, type CustomFetchOptions } from '@crawlee/http-client';

/**
 * A simple HTTP client implementation using the native `fetch` API.
 *
 * Custom implementations only need to override the `fetch` method.
 */
export class CustomFetchClient extends BaseHttpClient {
    protected override async fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response> {
        // The base class handles cookies, redirects, sessions, and timeouts.
        // We only need to perform the actual network request here.
        return fetch(request, options);
    }
}
