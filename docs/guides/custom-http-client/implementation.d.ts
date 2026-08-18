import { BaseHttpClient, type CustomFetchOptions } from '@crawlee/http-client';
/**
 * A simple HTTP client implementation using the native `fetch` API.
 *
 * Custom implementations only need to override the `fetch` method.
 */
export declare class CustomFetchClient extends BaseHttpClient {
    protected fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response>;
}
