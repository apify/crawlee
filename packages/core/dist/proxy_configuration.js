"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyConfiguration = void 0;
const tslib_1 = require("tslib");
const ow_1 = tslib_1.__importDefault(require("ow"));
const log_1 = tslib_1.__importDefault(require("@apify/log"));
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
class ProxyConfiguration {
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
        Object.defineProperty(this, "isManInTheMiddle", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "nextCustomUrlIndex", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "proxyUrls", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "usedProxyUrls", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "newUrlFunction", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "log", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: log_1.default.child({ prefix: 'ProxyConfiguration' })
        });
        const { validateRequired, ...rest } = options;
        (0, ow_1.default)(rest, ow_1.default.object.exactShape({
            proxyUrls: ow_1.default.optional.array.nonEmpty.ofType(ow_1.default.string.url),
            newUrlFunction: ow_1.default.optional.function,
        }));
        const { proxyUrls, newUrlFunction } = options;
        if (proxyUrls && newUrlFunction)
            this._throwCannotCombineCustomMethods();
        if (!proxyUrls && !newUrlFunction && validateRequired)
            this._throwNoOptionsProvided();
        this.proxyUrls = proxyUrls;
        this.newUrlFunction = newUrlFunction;
    }
    /**
     * This function creates a new {@apilink ProxyInfo} info object.
     * It is used by CheerioCrawler and PuppeteerCrawler to generate proxy URLs and also to allow the user to inspect
     * the currently used proxy via the requestHandler parameter `proxyInfo`.
     * Use it if you want to work with a rich representation of a proxy URL.
     * If you need the URL string only, use {@apilink ProxyConfiguration.newUrl}.
     * @param [sessionId]
     *  Represents the identifier of user {@apilink Session} that can be managed by the {@apilink SessionPool} or
     *  you can use the Apify Proxy [Session](https://docs.apify.com/proxy#sessions) identifier.
     *  When the provided sessionId is a number, it's converted to a string. Property sessionId of
     *  {@apilink ProxyInfo} is always returned as a type string.
     *
     *  All the HTTP requests going through the proxy with the same session identifier
     *  will use the same target proxy server (i.e. the same IP address).
     *  The identifier must not be longer than 50 characters and include only the following: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
     * @return Represents information about used proxy and its configuration.
     */
    async newProxyInfo(sessionId) {
        if (typeof sessionId === 'number')
            sessionId = `${sessionId}`;
        const url = await this.newUrl(sessionId);
        const { username, password, port, hostname } = new URL(url);
        return {
            sessionId,
            url,
            username,
            password,
            hostname,
            port: port,
        };
    }
    /**
     * Returns a new proxy URL based on provided configuration options and the `sessionId` parameter.
     * @param [sessionId]
     *  Represents the identifier of user {@apilink Session} that can be managed by the {@apilink SessionPool} or
     *  you can use the Apify Proxy [Session](https://docs.apify.com/proxy#sessions) identifier.
     *  When the provided sessionId is a number, it's converted to a string.
     *
     *  All the HTTP requests going through the proxy with the same session identifier
     *  will use the same target proxy server (i.e. the same IP address).
     *  The identifier must not be longer than 50 characters and include only the following: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
     * @return A string with a proxy URL, including authentication credentials and port number.
     *  For example, `http://bob:password123@proxy.example.com:8000`
     */
    async newUrl(sessionId) {
        if (typeof sessionId === 'number')
            sessionId = `${sessionId}`;
        if (this.newUrlFunction) {
            return this._callNewUrlFunction(sessionId);
        }
        return this._handleCustomUrl(sessionId);
    }
    /**
     * Handles custom url rotation with session
     */
    _handleCustomUrl(sessionId) {
        let customUrlToUse;
        if (!sessionId) {
            return this.proxyUrls[this.nextCustomUrlIndex++ % this.proxyUrls.length];
        }
        if (this.usedProxyUrls.has(sessionId)) {
            customUrlToUse = this.usedProxyUrls.get(sessionId);
        }
        else {
            customUrlToUse = this.proxyUrls[this.nextCustomUrlIndex++ % this.proxyUrls.length];
            this.usedProxyUrls.set(sessionId, customUrlToUse);
        }
        return customUrlToUse;
    }
    /**
     * Calls the custom newUrlFunction and checks format of its return value
     */
    async _callNewUrlFunction(sessionId) {
        let proxyUrl;
        try {
            proxyUrl = await this.newUrlFunction(sessionId);
            new URL(proxyUrl); // eslint-disable-line no-new
            return proxyUrl;
        }
        catch (err) {
            this._throwNewUrlFunctionInvalid(err);
        }
    }
    _throwNewUrlFunctionInvalid(err) {
        throw new Error(`The provided newUrlFunction did not return a valid URL.\nCause: ${err.message}`);
    }
    _throwCannotCombineCustomMethods() {
        throw new Error('Cannot combine custom proxies "options.proxyUrls" with custom generating function "options.newUrlFunction".');
    }
    _throwNoOptionsProvided() {
        throw new Error('One of "options.proxyUrls" or "options.newUrlFunction" needs to be provided.');
    }
}
exports.ProxyConfiguration = ProxyConfiguration;
//# sourceMappingURL=proxy_configuration.js.map