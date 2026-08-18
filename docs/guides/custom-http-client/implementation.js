import { BaseHttpClient } from '@crawlee/http-client';
/**
 * A simple HTTP client implementation using the native `fetch` API.
 *
 * Custom implementations only need to override the `fetch` method.
 */
export class CustomFetchClient extends BaseHttpClient {
    async fetch(request, options) {
        // The base class handles cookies, redirects, sessions, and timeouts.
        // We only need to perform the actual network request here.
        return fetch(request, options);
    }
}
