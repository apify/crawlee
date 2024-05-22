import log from '@apify/log';
import { cryptoRandomObjectId } from '@apify/utilities';
import type { Dictionary } from '@crawlee/types';
import ow from 'ow';

import type { Request } from './request';

export interface ProxyConfigurationFunction {
    (sessionId: string | number, options?: { request?: Request }): string | null | Promise<string | null>;
}

export interface ProxyConfigurationOptions {
    /**
     * An array of custom proxy URLs to be rotated.
     * Custom proxies are not compatible with Apify Proxy and an attempt to use both
     * configuration options will cause an error to be thrown on initialize.
     */
    proxyUrls?: string[];

    /**
     * Custom function that allows you to generate the new proxy URL dynamically. It gets the `sessionId` as a parameter and an optional parameter with the `Request` object when applicable.
     * Can return either stringified proxy URL or `null` if the proxy should not be used. Can be asynchronous.
     *
     * This function is used to generate the URL when {@apilink ProxyConfiguration.newUrl} or {@apilink ProxyConfiguration.newProxyInfo} is called.
     */
    newUrlFunction?: ProxyConfigurationFunction;

    /**
     * An array of custom proxy URLs to be rotated stratified in tiers.
     * This is a more advanced version of `proxyUrls` that allows you to define a hierarchy of proxy URLs
     * If everything goes well, all the requests will be sent through the first proxy URL in the list.
     * Whenever the crawler encounters a problem with the current proxy on the given domain, it will switch to the higher tier for this domain.
     * The crawler probes lower-level proxies at intervals to check if it can make the tier downshift.
     *
     * This feature is useful when you have a set of proxies with different performance characteristics (speed, price, antibot performance etc.) and you want to use the best one for each domain.
     */
    tieredProxyUrls?: string[][];
}

export interface TieredProxy {
    proxyUrl: string;
    proxyTier?: number;
}

/**
 * The main purpose of the ProxyInfo object is to provide information
 * about the current proxy connection used by the crawler for the request.
 * Outside of crawlers, you can get this object by calling {@apilink ProxyConfiguration.newProxyInfo}.
 *
 * **Example usage:**
 *
 * ```javascript
 * const proxyConfiguration = new ProxyConfiguration({
 *   proxyUrls: ['...', '...'] // List of Proxy URLs to rotate
 * });
 *
 * // Getting proxyInfo object by calling class method directly
 * const proxyInfo = await proxyConfiguration.newProxyInfo();
 *
 * // In crawler
 * const crawler = new CheerioCrawler({
 *   // ...
 *   proxyConfiguration,
 *   requestHandler({ proxyInfo }) {
 *      // Getting used proxy URL
 *       const proxyUrl = proxyInfo.url;
 *
 *      // Getting ID of used Session
 *       const sessionIdentifier = proxyInfo.sessionId;
 *   }
 * })
 *
 * ```
 */
export interface ProxyInfo {
    /**
     * The identifier of used {@apilink Session}, if used.
     */
    sessionId?: string;

    /**
     * The URL of the proxy.
     */
    url: string;

    /**
     * Username for the proxy.
     */
    username?: string;

    /**
     * User's password for the proxy.
     */
    password: string;

    /**
     * Hostname of your proxy.
     */
    hostname: string;

    /**
     * Proxy port.
     */
    port: number | string;

    /**
     * Proxy tier for the current proxy, if applicable (only for `tieredProxyUrls`).
     */
    proxyTier?: number;
}

interface TieredProxyOptions {
    request?: Request;
    proxyTier?: number;
}

/**
 * Internal class for tracking the proxy tier history for a specific domain.
 *
 * Predicts the best proxy tier for the next request based on the error history for different proxy tiers.
 */
class ProxyTierTracker {
    private histogram: number[];
    private currentTier: number;

    constructor(tieredProxyUrls: string[][]) {
        this.histogram = tieredProxyUrls.map(() => 0);
        this.currentTier = 0;
    }

    /**
     * Processes a single step of the algorithm and updates the current tier prediction based on the error history.
     */
    private processStep(): void {
        this.histogram.forEach((x, i) => {
            if (this.currentTier === i) return;
            if (x > 0) this.histogram[i]--;
        });

        const left = this.currentTier > 0 ? this.histogram[this.currentTier - 1] : Infinity;
        const right = this.currentTier < this.histogram.length - 1 ? this.histogram[this.currentTier + 1] : Infinity;

        if (this.histogram[this.currentTier] > Math.min(left, right)) {
            this.currentTier = left <= right ? this.currentTier - 1 : this.currentTier + 1;
        } else if (this.histogram[this.currentTier] === left) {
            this.currentTier--;
        }
    }

    /**
     * Increases the error score for the given proxy tier. This raises the chance of picking a different proxy tier for the subsequent requests.
     *
     * The error score is increased by 10 for the given tier. This means that this tier will be disadvantaged for the next 10 requests (every new request prediction decreases the error score by 1).
     * @param tier The proxy tier to mark as problematic.
     */
    addError(tier: number) {
        this.histogram[tier] += 10;
    }

    /**
     * Returns the best proxy tier for the next request based on the error history for different proxy tiers.
     * @returns The proxy tier prediction
     */
    predictTier() {
        this.processStep();
        return this.currentTier;
    }
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
    protected proxyUrls?: string[];
    protected tieredProxyUrls?: string[][];
    protected usedProxyUrls = new Map<string, string>();
    protected newUrlFunction?: ProxyConfigurationFunction;
    protected log = log.child({ prefix: 'ProxyConfiguration' });
    protected domainTiers = new Map<string, ProxyTierTracker>();

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
                proxyUrls: ow.optional.array.nonEmpty.ofType(ow.string.url),
                newUrlFunction: ow.optional.function,
                tieredProxyUrls: ow.optional.array.nonEmpty.ofType(ow.array.nonEmpty.ofType(ow.string.url)),
            }),
        );

        const { proxyUrls, newUrlFunction, tieredProxyUrls } = options;

        if ([proxyUrls, newUrlFunction, tieredProxyUrls].filter((x) => x).length > 1)
            this._throwCannotCombineCustomMethods();
        if (!proxyUrls && !newUrlFunction && validateRequired) this._throwNoOptionsProvided();

        this.proxyUrls = proxyUrls;
        this.newUrlFunction = newUrlFunction;
        this.tieredProxyUrls = tieredProxyUrls;
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
    async newProxyInfo(sessionId?: string | number, options?: TieredProxyOptions): Promise<ProxyInfo | undefined> {
        if (typeof sessionId === 'number') sessionId = `${sessionId}`;

        let url: string | undefined;
        let tier: number | undefined;
        if (this.tieredProxyUrls) {
            const { proxyUrl, proxyTier } = this._handleTieredUrl(sessionId ?? cryptoRandomObjectId(6), options);
            url = proxyUrl;
            tier = proxyTier;
        } else {
            url = await this.newUrl(sessionId, options);
        }

        if (!url) return undefined;

        const { username, password, port, hostname } = new URL(url);

        return {
            sessionId,
            url,
            username,
            password,
            hostname,
            port: port!,
            proxyTier: tier,
        };
    }

    /**
     * Given a session identifier and a request / proxy tier, this function returns a new proxy URL based on the provided configuration options.
     * @param _sessionId Session identifier
     * @param options Options for the tiered proxy rotation
     * @returns An object with the proxy URL and the proxy tier used.
     */
    protected _handleTieredUrl(_sessionId: string, options?: TieredProxyOptions): TieredProxy {
        if (!this.tieredProxyUrls) throw new Error('Tiered proxy URLs are not set');

        if (!options || (!options?.request && options?.proxyTier === undefined)) {
            const allProxyUrls = this.tieredProxyUrls.flat();
            return {
                proxyUrl: allProxyUrls[this.nextCustomUrlIndex++ % allProxyUrls.length],
            };
        }

        let tierPrediction = options.proxyTier!;

        if (typeof tierPrediction !== 'number') {
            tierPrediction = this.predictProxyTier(options.request!)!;
        }

        const proxyTier = this.tieredProxyUrls![tierPrediction];

        return {
            proxyUrl: proxyTier[this.nextCustomUrlIndex++ % proxyTier.length],
            proxyTier: tierPrediction,
        };
    }

    /**
     * Given a `Request` object, this function returns the tier of the proxy that should be used for the request.
     *
     * This returns `null` if `tieredProxyUrls` option is not set.
     */
    protected predictProxyTier(request: Request): number | null {
        if (!this.tieredProxyUrls) return null;

        const domain = new URL(request.url).hostname;
        if (!this.domainTiers.has(domain)) {
            this.domainTiers.set(domain, new ProxyTierTracker(this.tieredProxyUrls));
        }

        request.userData.__crawlee ??= {};

        const tracker = this.domainTiers.get(domain)!;

        if (typeof request.userData.__crawlee.lastProxyTier === 'number') {
            tracker.addError(request.userData.__crawlee.lastProxyTier);
        }

        const tierPrediction = tracker.predictTier();

        request.userData.__crawlee.lastProxyTier = tierPrediction;
        request.userData.__crawlee.forefront = true;

        return tierPrediction;
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
    async newUrl(sessionId?: string | number, options?: TieredProxyOptions): Promise<string | undefined> {
        if (typeof sessionId === 'number') sessionId = `${sessionId}`;

        if (this.newUrlFunction) {
            return (await this._callNewUrlFunction(sessionId, { request: options?.request })) ?? undefined;
        }

        if (this.tieredProxyUrls) {
            return this._handleTieredUrl(sessionId ?? cryptoRandomObjectId(6), options).proxyUrl;
        }

        return this._handleCustomUrl(sessionId);
    }

    /**
     * Handles custom url rotation with session
     */
    protected _handleCustomUrl(sessionId?: string): string {
        let customUrlToUse: string;

        if (!sessionId) {
            return this.proxyUrls![this.nextCustomUrlIndex++ % this.proxyUrls!.length];
        }

        if (this.usedProxyUrls.has(sessionId)) {
            customUrlToUse = this.usedProxyUrls.get(sessionId)!;
        } else {
            customUrlToUse = this.proxyUrls![this.nextCustomUrlIndex++ % this.proxyUrls!.length];
            this.usedProxyUrls.set(sessionId, customUrlToUse);
        }

        return customUrlToUse;
    }

    /**
     * Calls the custom newUrlFunction and checks format of its return value
     */
    protected async _callNewUrlFunction(sessionId?: string, options?: { request?: Request }) {
        const proxyUrl = await this.newUrlFunction!(sessionId!, options);
        try {
            if (proxyUrl) {
                new URL(proxyUrl); // eslint-disable-line no-new
            }
            return proxyUrl;
        } catch (err) {
            this._throwNewUrlFunctionInvalid(err as Error);
        }
    }

    protected _throwNewUrlFunctionInvalid(err: Error): never {
        throw new Error(`The provided newUrlFunction did not return a valid URL.\nCause: ${err.message}`);
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
