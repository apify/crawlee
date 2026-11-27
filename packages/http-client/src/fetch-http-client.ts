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
                'FetchHttpClient does not support proxies and refuses to send requests directly when one is configured. ' +
                    'Pass an `httpClient` that supports proxies, such as the one from @crawlee/impit-client, or remove the proxy configuration.',
            );
        }

        if (options?.ignoreTlsErrors) {
            this.#logger?.warningOnce(
                'FetchHttpClient cannot disable TLS certificate verification, the `ignoreTlsErrors` option is ignored. ' +
                    'Pass an `httpClient` that can, such as the one from @crawlee/impit-client.',
            );
        }

        return fetch(request, options);
    }
}
