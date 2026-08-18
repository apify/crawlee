import { BaseHttpClient } from './base-http-client.js';
/**
 * A HTTP client implementation using the native `fetch` API.
 *
 * This implementation does not support proxying.
 */
export class FetchHttpClient extends BaseHttpClient {
    #logger;
    constructor(options) {
        super(options);
        this.#logger = options?.logger;
    }
    async fetch(request, options) {
        if (options?.ignoreTlsErrors) {
            this.#logger?.warningOnce('FetchHttpClient cannot disable TLS certificate verification, the `ignoreTlsErrors` option is ignored. ' +
                'Install the optional @crawlee/impit-client dependency to make it work.');
        }
        return fetch(request, options);
    }
}
