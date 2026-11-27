import type { CrawleeLogger } from '@crawlee/types';

import { BaseHttpClient, type CustomFetchOptions } from './base-http-client.js';

/**
 * A HTTP client implementation using the native `fetch` API.
 *
 * This implementation does not support proxying and throws when a request asks for a proxy.
 */
export class FetchHttpClient extends BaseHttpClient {
    #logger?: CrawleeLogger;

    constructor(options?: { logger?: CrawleeLogger }) {
        super(options);
        this.#logger = options?.logger;
    }

    protected override async fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response> {
        if (options?.proxyUrl) {
            throw new Error(
                'FetchHttpClient does not support proxies, refusing to send the request without one. ' +
                    'Install the optional @crawlee/impit-client dependency or pass an `httpClient` that supports proxies.',
            );
        }

        if (options?.ignoreTlsErrors) {
            this.#logger?.warningOnce(
                'FetchHttpClient cannot disable TLS certificate verification, the `ignoreTlsErrors` option is ignored. ' +
                    'Install the optional @crawlee/impit-client dependency to make it work.',
            );
        }

        return fetch(request, options);
    }
}
