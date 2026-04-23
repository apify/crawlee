import type { Dictionary, ProxyInfo } from '@crawlee/types';
import ow from 'ow';

import type { Request } from './request.js';
import { serviceLocator } from './service_locator.js';

export interface ProxyConfigurationFunction {
    (options?: { request?: Request }): string | null | Promise<string | null>;
}

type UrlList = (string | null)[];

export interface ProxyConfigurationOptions {
    /**
     * An array of custom proxy URLs to be rotated.
     * Custom proxies are not compatible with Apify Proxy and an attempt to use both
     * configuration options will cause an error to be thrown on initialize.
     */
    proxyUrls?: UrlList;

    /**
     * Custom function that allows you to generate the new proxy URL dynamically. It gets an optional parameter with the `Request` object when applicable.
     * Can return either stringified proxy URL or `null` if the proxy should not be used. Can be asynchronous.
     *
     * This function is used to generate the URL when {@apilink ProxyConfiguration.newUrl} or {@apilink ProxyConfiguration.newProxyInfo} is called.
     */
    newUrlFunction?: ProxyConfigurationFunction;
}

interface NewUrlOptions {
    request?: Request;
}

/**
 * Configures connection to a proxy server with the provided options. Proxy servers are used to prevent target websites from blocking
 * your crawlers based on IP address rate limits or blacklists. Setting proxy configuration in your crawlers automatically configures
 * them to use the selected proxies for all connections. You can get information about the currently used proxy by inspecting
 * the {@apilink ProxyInfo} property in your crawler's page function. There, you can inspect the proxy's URL and other attributes.
 *
 * If you want to use your own proxies, use the {@apilink ProxyConfigurationOptions.proxyUrls} option. Your list of proxy URLs will
 * be rotated by the configuration if this option is provided.
 *
 * **Example usage:**
 *
 * ```javascript
 *
 * const proxyConfiguration = new ProxyConfiguration({
 *   proxyUrls: ['...', '...'],
 * });
 *
 * const crawler = new CheerioCrawler({
 *   // ...
 *   proxyConfiguration,
 *   requestHandler({ proxyInfo }) {
 *      const usedProxyUrl = proxyInfo.url; // Getting the proxy URL
 *   }
 * })
 *
 * ```
 * @category Scaling
 */
export class ProxyConfiguration {
    isManInTheMiddle = false;
    protected nextCustomUrlIndex = 0;
    protected proxyUrls?: UrlList;
    protected usedProxyUrls = new Map<string, string | null>();
    protected newUrlFunction?: ProxyConfigurationFunction;
    protected log = serviceLocator.getLogger().child({ prefix: 'ProxyConfiguration' });

    /**
     * Creates a {@apilink ProxyConfiguration} instance based on the provided options. Proxy servers are used to prevent target websites from
     * blocking your crawlers based on IP address rate limits or blacklists. Setting proxy configuration in your crawlers automatically configures
     * them to use the selected proxies for all connections.
     *
     * ```javascript
     * const proxyConfiguration = new ProxyConfiguration({
     *     proxyUrls: ['http://user:pass@proxy-1.com', 'http://user:pass@proxy-2.com'],
     * });
     *
     * const crawler = new CheerioCrawler({
     *   // ...
     *   proxyConfiguration,
     *   requestHandler({ proxyInfo }) {
     *       const usedProxyUrl = proxyInfo.url; // Getting the proxy URL
     *   }
     * })
     *
     * ```
     */
    constructor(options: ProxyConfigurationOptions = {}) {
        const { validateRequired, ...rest } = options as Dictionary;
        ow(
            rest,
            ow.object.exactShape({
                proxyUrls: ow.optional.array.nonEmpty.ofType(ow.any(ow.string.url, ow.null)),
                newUrlFunction: ow.optional.function,
            }),
        );

        const { proxyUrls, newUrlFunction } = options;

        if (proxyUrls && newUrlFunction) this._throwCannotCombineCustomMethods();
        if (!proxyUrls && !newUrlFunction && validateRequired) this._throwNoOptionsProvided();

        this.proxyUrls = proxyUrls;
        this.newUrlFunction = newUrlFunction;
    }

    /**
     * This function creates a new {@apilink ProxyInfo} info object.
     * It is used by CheerioCrawler and PuppeteerCrawler to generate proxy URLs and also to allow the user to inspect
     * the currently used proxy via the requestHandler parameter `proxyInfo`.
     * Use it if you want to work with a rich representation of a proxy URL.
     * If you need the URL string only, use {@apilink ProxyConfiguration.newUrl}.
     *
     * @return Represents information about used proxy and its configuration.
     */
    async newProxyInfo(options?: NewUrlOptions): Promise<ProxyInfo | undefined> {
        const url = await this.newUrl(options);
        if (!url) return undefined;

        const { username, password, port, hostname } = new URL(url);

        return {
            url,
            username: decodeURIComponent(username),
            password: decodeURIComponent(password),
            hostname,
            port: port!,
        };
    }

    /**
     * Returns a new proxy URL based on provided configuration options.
     *
     * @return A string with a proxy URL, including authentication credentials and port number.
     *  For example, `http://bob:password123@proxy.example.com:8000`
     */
    async newUrl(options?: NewUrlOptions): Promise<string | undefined> {
        if (this.newUrlFunction) {
            return (await this._callNewUrlFunction({ request: options?.request })) ?? undefined;
        }

        return this._handleProxyUrlsList() ?? undefined;
    }

    protected _handleProxyUrlsList(): string | null {
        return this.proxyUrls![this.nextCustomUrlIndex++ % this.proxyUrls!.length];
    }

    /**
     * Calls the custom newUrlFunction and checks format of its return value
     */
    protected async _callNewUrlFunction(options?: { request?: Request }) {
        const proxyUrl = await this.newUrlFunction!(options);
        try {
            if (proxyUrl) {
                new URL(proxyUrl); // eslint-disable-line no-new
            }
            return proxyUrl;
        } catch (err) {
            throw new Error(
                `The provided newUrlFunction did not return a valid URL.\nCause: ${(err as Error).message}`,
            );
        }
    }

    protected _throwCannotCombineCustomMethods(): never {
        throw new Error(
            'Cannot combine custom proxies "options.proxyUrls" with custom generating function "options.newUrlFunction".',
        );
    }

    protected _throwNoOptionsProvided(): never {
        throw new Error('One of "options.proxyUrls" or "options.newUrlFunction" needs to be provided.');
    }
}
