import { BaseHttpClient, type CustomFetchOptions } from '@crawlee/http-client';
/**
 * A HTTP client implementation based on the `got-scraping` library.
 */
export declare class GotScrapingHttpClient extends BaseHttpClient {
    /**
     * Type guard that validates the HTTP method (excluding CONNECT).
     * @param request - The HTTP request to validate
     */
    private validateRequest;
    private iterateHeaders;
    private parseHeaders;
    fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response>;
}
