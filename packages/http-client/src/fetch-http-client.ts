import { BaseHttpClient, type CustomFetchOptions } from './base-http-client.js';

/**
 * A HTTP client implementation using the native `fetch` API.
 *
 * This implementation does not support proxying.
 */
export class FetchHttpClient extends BaseHttpClient {
    override async fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response> {
        return fetch(request, options);
    }
}
