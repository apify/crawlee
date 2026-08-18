import type { CustomFetchOptions } from '@crawlee/http-client';
import { BaseHttpClient } from '@crawlee/http-client';
import type { CrawleeLogger } from '@crawlee/types';
import { type ImpitOptions } from 'impit';
export declare const Browser: {
    readonly Chrome: "chrome";
    readonly Firefox: "firefox";
};
/**
 * A HTTP client implementation based on the `impit` library.
 */
export declare class ImpitHttpClient extends BaseHttpClient {
    #private;
    private getClient;
    /**
     * @param options.cacheClients Whether to cache `impit` clients between requests. Defaults to `true`.
     */
    constructor(options?: Omit<ImpitOptions, 'proxyUrl' | 'timeout'> & {
        cacheClients?: boolean;
        logger?: CrawleeLogger;
    });
    /**
     * @inheritDoc
     */
    fetch(request: Request, options?: RequestInit & CustomFetchOptions): Promise<Response>;
    private resolveImpitBrowser;
}
