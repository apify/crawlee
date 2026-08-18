import { z } from 'zod';
import { parseArgument, schemas } from './validators.js';
const proxyConfigurationOptionsSchema = z.strictObject({
    proxyUrls: z
        .array(z.union([z.url(), z.null()]))
        .nonempty()
        .optional(),
    newUrlFunction: schemas.anyFunction.optional(),
});
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
    #nextCustomUrlIndex = 0;
    #proxyUrls;
    #newUrlFunction;
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
    constructor(options = {}) {
        const { validateRequired, ...rest } = options;
        if ('tieredProxyUrls' in rest) {
            throw new Error('The `tieredProxyUrls` option has been removed in Crawlee v4. ' +
                'See the v4 upgrading guide for the recommended migration to named sessions.');
        }
        const { proxyUrls, newUrlFunction } = parseArgument(rest, proxyConfigurationOptionsSchema);
        if (proxyUrls && newUrlFunction)
            this.throwCannotCombineCustomMethods();
        if (!proxyUrls && !newUrlFunction && validateRequired)
            this.throwNoOptionsProvided();
        this.#proxyUrls = proxyUrls;
        this.#newUrlFunction = newUrlFunction;
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
    async newProxyInfo(options) {
        const url = await this.newUrl(options);
        if (!url)
            return undefined;
        const { username, password, port, hostname } = new URL(url);
        return {
            url,
            username: decodeURIComponent(username),
            password: decodeURIComponent(password),
            hostname,
            port: port,
        };
    }
    /**
     * Returns a new proxy URL based on provided configuration options.
     *
     * @return A string with a proxy URL, including authentication credentials and port number.
     *  For example, `http://bob:password123@proxy.example.com:8000`
     */
    async newUrl(options) {
        if (this.#newUrlFunction) {
            return (await this.callNewUrlFunction({ request: options?.request })) ?? undefined;
        }
        return this.handleProxyUrlsList() ?? undefined;
    }
    handleProxyUrlsList() {
        return this.#proxyUrls[this.#nextCustomUrlIndex++ % this.#proxyUrls.length];
    }
    /**
     * Calls the custom newUrlFunction and checks format of its return value
     */
    async callNewUrlFunction(options) {
        const proxyUrl = await this.#newUrlFunction(options);
        try {
            if (proxyUrl) {
                new URL(proxyUrl); // eslint-disable-line no-new
            }
            return proxyUrl;
        }
        catch (err) {
            throw new Error(`The provided newUrlFunction did not return a valid URL.\nCause: ${err.message}`);
        }
    }
    throwCannotCombineCustomMethods() {
        throw new Error('Cannot combine custom proxies "options.proxyUrls" with custom generating function "options.newUrlFunction".');
    }
    throwNoOptionsProvided() {
        throw new Error('One of "options.proxyUrls" or "options.newUrlFunction" needs to be provided.');
    }
}
