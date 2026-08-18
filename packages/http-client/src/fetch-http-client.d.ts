import type { CrawleeLogger } from '@crawlee/types';
import { BaseHttpClient, type CustomFetchOptions } from './base-http-client.js';
/**
 * A HTTP client implementation using the native `fetch` API.
 *
 * This implementation does not support proxying.
 */
export declare class FetchHttpClient extends BaseHttpClient {
    #private;
    constructor(options?: {
        logger?: CrawleeLogger;
    });
    fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response>;
}
