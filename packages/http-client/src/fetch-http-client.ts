import type { CrawleeLogger } from '@crawlee/types';

import { BaseHttpClient, type CustomFetchOptions } from './base-http-client.js';

/**
 * A HTTP client implementation using the native `fetch` API.
 *
 * This implementation does not support proxying.
 */
export class FetchHttpClient extends BaseHttpClient {
    #logger?: CrawleeLogger;

    constructor(options?: { logger?: CrawleeLogger }) {
        super(options);
        this.#logger = options?.logger;
    }

    override async fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response> {
        if (options?.ignoreTlsErrors) {
            this.#logger?.warningOnce(
                'FetchHttpClient cannot disable TLS certificate verification, the `ignoreTlsErrors` option is ignored. ' +
                    'Install the optional @crawlee/impit-client dependency to make it work.',
            );
        }

        return fetch(request, options);
    }
}
