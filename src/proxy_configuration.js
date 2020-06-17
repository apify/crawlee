import { checkParamOrThrow } from 'apify-client/build/utils';
import { ENV_VARS, LOCAL_ENV_VARS } from 'apify-shared/consts';
import { APIFY_PROXY_VALUE_REGEX } from 'apify-shared/regexs';
import { URL } from 'url';
import { COUNTRY_CODE_REGEX } from './constants';
import { apifyClient } from './utils';
import { requestAsBrowser } from './utils_request';
import log from './utils_log';

// CONSTANTS
const PROTOCOL = 'http';
const APIFY_PROXY_STATUS_URL = 'http://proxy.apify.com/?format=json';
// https://docs.apify.com/proxy/datacenter-proxy#username-parameters
const MAX_SESSION_ID_LENGTH = 50;

/**
 * @typedef ProxyConfigurationOptions
 * @property {string} [password]
 *   User's password for the proxy. By default, it is taken from the `APIFY_PROXY_PASSWORD`
 *   environment variable, which is automatically set by the system when running the actors.
 * @property {string[]} [groups]
 *   An array of proxy groups to be used by the [Apify Proxy](https://docs.apify.com/proxy).
 *   If not provided, the proxy will select the groups automatically.
 * @property {string} [countryCode]
 *   If set and relevant proxies are available in your Apify account, all proxied requests will
 *   use IP addresses that are geolocated to the specified country. For example `GB` for IPs
 *   from Great Britain. Note that online services often have their own rules for handling
 *   geolocation and thus the country selection is a best attempt at geolocation, rather than
 *   a guaranteed hit. This parameter is optional, by default, each proxied request is assigned
 *   an IP address from a random country. The country code needs to be a two letter ISO country code. See the
 *   [full list of available country codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2#Officially_assigned_code_elements).
 *   This parameter is optional, by default, the proxy uses all available proxy servers from all countries.
 *   on the Apify cloud, or when using the [Apify CLI](https://github.com/apifytech/apify-cli).
 * @property {string[]} [apifyProxyGroups]
 *   Same option as `groups` which can be used to
 *   configurate the proxy by UI input schema. You should use the `groups` option in your crawler code.
 * @property {string} [apifyProxyCountry]
 *   Same option as `countryCode` which can be used to
 *   configurate the proxy by UI input schema. You should use the `countryCode` option in your crawler code.
 * @property {string[]} [proxyUrls]
 *   An array of custom proxy URLs to be rotated.
 *   Custom proxies are not compatible with Apify Proxy and an attempt to use both
 *   configuration options will cause an error to be thrown on initialize.
 * @property {function} [newUrlFunction]
 *   Custom function that allows you to generate the new proxy URL dynamically. It gets the `sessionId` as a parameter
 *   and should always return stringified proxy URL.
 *   This function is used to generate the URL when {@link ProxyConfiguration.newUrl} or {@link ProxyConfiguration.newProxyInfo} is called.
 */

/**
 * The main purpose of the ProxyInfo object is to provide information
 * about the current proxy connection used by the crawler for the request.
 * Outside of crawlers, you can get this object by calling {@link ProxyConfiguration.newProxyInfo}.
 *
 * **Example usage:**
 *
 * ```javascript
 *
 * const proxyConfiguration = await Apify.createProxyConfiguration({
 *   groups: ['GROUP1', 'GROUP2'] // List of Apify Proxy groups
 *   countryCode: 'US',
 * });
 *
 * // Getting proxyInfo object by calling class method directly
 * const proxyInfo = proxyConfiguration.newProxyInfo();
 *
 * // In crawler
 * const crawler = new Apify.CheerioCrawler({
 *   // ...
 *   proxyConfiguration,
 *   handlePageFunction: ({ proxyInfo }) => {
 *      // Getting used proxy URL
 *       const proxyUrl = proxyInfo.url;
 *
 *      // Getting ID of used Session
 *       const sessionIdentifier = proxyInfo.sessionId;
 *   }
 * })
 *
 * ```
 * @typedef ProxyInfo
 * @property {string} [sessionId]
 *   The identifier of used {@link Session}, if used.
 * @property {string} url
 *   The URL of the proxy.
 * @property {string[]} groups
 *   An array of proxy groups to be used by the [Apify Proxy](https://docs.apify.com/proxy).
 *   If not provided, the proxy will select the groups automatically.
 * @property {string} [countryCode]
 *   If set and relevant proxies are available in your Apify account, all proxied requests will
 *   use IP addresses that are geolocated to the specified country. For example `GB` for IPs
 *   from Great Britain. Note that online services often have their own rules for handling
 *   geolocation and thus the country selection is a best attempt at geolocation, rather than
 *   a guaranteed hit. This parameter is optional, by default, each proxied request is assigned
 *   an IP address from a random country. The country code needs to be a two letter ISO country code. See the
 *   [full list of available country codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2#Officially_assigned_code_elements).
 *   This parameter is optional, by default, the proxy uses all available proxy servers from all countries.
 * @property {string} password
 *   User's password for the proxy. By default, it is taken from the `APIFY_PROXY_PASSWORD`
 *   environment variable, which is automatically set by the system when running the actors
 *   on the Apify cloud, or when using the [Apify CLI](https://github.com/apifytech/apify-cli).
 * @property {string} hostname
 *   Hostname of your proxy.
 * @property {string} port
 *   Proxy port.
 */

/**
 * Configures connection to a proxy server with the provided options. Proxy servers are used to prevent target websites from blocking
 * your crawlers based on IP address rate limits or blacklists. Setting proxy configuration in your crawlers automatically configures
 * them to use the selected proxies for all connections. You can get information about the currently used proxy by inspecting
 * the {@link ProxyInfo} property in your crawler's page function. There, you can inspect the proxy's URL and other attributes.
 *
 * The proxy servers are managed by [Apify Proxy](https://docs.apify.com/proxy). To be able to use Apify Proxy,
 * you need an Apify account and access to the selected proxies. If you provide no configuration option,
 * the proxies will be managed automatically using a smart algorithm.
 *
 * If you want to use your own proxies, use the {@link ProxyConfigurationOptions.proxyUrls} option. Your list of proxy URLs will
 * be rotated by the configuration if this option is provided.
 *
 * **Example usage:**
 *
 * ```javascript
 *
 * const proxyConfiguration = await Apify.createProxyConfiguration({
 *   groups: ['GROUP1', 'GROUP2'] // List of Apify Proxy groups
 *   countryCode: 'US',
 * });
 *
 * const crawler = new Apify.CheerioCrawler({
 *   // ...
 *   proxyConfiguration,
 *   handlePageFunction: ({ proxyInfo }) => {
 *      const usedProxyUrl = proxyInfo.url; // Getting the proxy URL
 *   }
 * })
 *
 * ```
 * @hideconstructor
 */
export class ProxyConfiguration {
    /**
     * Configuration of proxy.
     *
     * @param {ProxyConfigurationOptions} [options] All `ProxyConfiguration` options.
     */
    constructor(options = {}) {
        const {
            groups = [],
            apifyProxyGroups = [],
            countryCode,
            apifyProxyCountry,
            proxyUrls,
            password = process.env[ENV_VARS.PROXY_PASSWORD],
            newUrlFunction,
        } = options;

        const groupsToUse = groups.length ? groups : apifyProxyGroups;
        const countryCodeToUse = countryCode || apifyProxyCountry;
        const hostname = process.env[ENV_VARS.PROXY_HOSTNAME] || LOCAL_ENV_VARS[ENV_VARS.PROXY_HOSTNAME];
        const port = Number(process.env[ENV_VARS.PROXY_PORT] || LOCAL_ENV_VARS[ENV_VARS.PROXY_PORT]);

        // Validation
        checkParamOrThrow(groupsToUse, 'opts.groups', '[String]');
        checkParamOrThrow(countryCodeToUse, 'opts.countryCode', 'Maybe String');
        checkParamOrThrow(password, 'opts.password', 'Maybe String');
        checkParamOrThrow(proxyUrls, 'options.proxyUrls', 'Maybe [String]');
        checkParamOrThrow(newUrlFunction, 'options.newUrlFunction', 'Maybe Function');
        if (((proxyUrls || newUrlFunction) && ((groupsToUse.length) || countryCodeToUse))) {
            this._throwCannotCombineCustomWithApify();
        }
        if (proxyUrls && newUrlFunction) this._throwCannotCombineCustomMethods();
        if (proxyUrls) this._validateProxyUrls(proxyUrls);
        if (countryCodeToUse) this._validateCountryCode(countryCodeToUse);
        this._validateGroupsStructure(groupsToUse);

        this.groups = groupsToUse;
        this.countryCode = countryCodeToUse;
        this.password = password;
        this.hostname = hostname;
        this.port = port;
        this.nextCustomUrlIndex = 0;
        this.proxyUrls = proxyUrls;
        this.usedProxyUrls = new Map();
        this.newUrlFunction = newUrlFunction;
        this.usesApifyProxy = !this.proxyUrls && !this.newUrlFunction;
    }

    /**
     * Loads proxy password if token is provided and checks access to Apify Proxy and provided proxy groups
     * if Apify Proxy configuration is used.
     * Also checks if country has access to Apify Proxy groups if the country code is provided.
     *
     * You should use the {@link Apify.createProxyConfiguration} function to create a pre-initialized
     * `ProxyConfiguration` instance instead of calling this manually.
     *
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.usesApifyProxy) {
            await this._setPasswordIfToken();

            await this._checkAccess();
        }
    }


    /**
     * This function creates a new {@link ProxyInfo} info object.
     * It is used by CheerioCrawler and PuppeteerCrawler to generate proxy URLs and also to allow the user to inspect
     * the currently used proxy via the handlePageFunction parameter: proxyInfo.
     * Use it if you want to work with a rich representation of a proxy URL.
     * If you need the URL string only, use {@link ProxyConfiguration.newUrl}.
     * @param {string} [sessionId]
     *  Represents the identifier of user {@link Session} that can be managed by the {@link SessionPool} or
     *  you can use the Apify Proxy [Session](https://docs.apify.com/proxy/datacenter-proxy#session-persistence) identifier.
     *
     *  All the HTTP requests going through the proxy with the same session identifier
     *  will use the same target proxy server (i.e. the same IP address).
     *  The identifier must not be longer than 50 characters and include only the following: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
     * @return {ProxyInfo} represents information about used proxy and its configuration.
     */
    newProxyInfo(sessionId) {
        if (sessionId) this._validateSessionArgumentStructure(sessionId);
        const url = this.newUrl(sessionId);

        const { groups, countryCode, password, port, hostname } = this.usesApifyProxy ? this : new URL(url);

        return {
            sessionId,
            url,
            groups,
            countryCode,
            password,
            hostname,
            port,
        };
    }

    /**
     * Returns a new proxy URL based on provided configuration options and the `sessionId` parameter.
     * @param {string} [sessionId]
     *  Represents the identifier of user {@link Session} that can be managed by the {@link SessionPool} or
     *  you can use the Apify Proxy [Session](https://docs.apify.com/proxy/datacenter-proxy#session-persistence) identifier.
     *
     *  All the HTTP requests going through the proxy with the same session identifier
     *  will use the same target proxy server (i.e. the same IP address).
     *  The identifier must not be longer than 50 characters and include only the following: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
     * @return {string} represents the proxy URL.
     */
    newUrl(sessionId) {
        if (sessionId) this._validateSessionArgumentStructure(sessionId);
        if (this.newUrlFunction) {
            return this._callNewUrlFunction(sessionId);
        }
        if (this.proxyUrls) {
            return this._handleCustomUrl(sessionId);
        }
        const username = this._getUsername(sessionId);
        const { password, hostname, port } = this;

        return `${PROTOCOL}://${username}:${password}@${hostname}:${port}`;
    }

    /**
     * Returns proxy username.
     * @param {string} [sessionId]
     * @return {string} the proxy username
     * @ignore
     */
    _getUsername(sessionId) {
        let username;
        const { groups, countryCode } = this;
        const parts = [];

        if (groups && groups.length) {
            parts.push(`groups-${groups.join('+')}`);
        }
        if (sessionId) {
            parts.push(`session-${sessionId}`);
        }
        if (countryCode) {
            parts.push(`country-${countryCode}`);
        }

        username = parts.join(',');

        if (parts.length === 0) username = 'auto';

        return username;
    }

    /**
     * Checks if Apify Token is provided in env
     * and gets the password via API and sets it to env
     * @returns {Promise<void>}
     * @ignore
     */
    async _setPasswordIfToken() {
        const token = process.env[ENV_VARS.TOKEN] || LOCAL_ENV_VARS[ENV_VARS.TOKEN];
        if (token) {
            const { proxy: { password } } = await apifyClient.users.getUser({ token, userId: 'me' });
            if (this.password) {
                if (this.password !== password) {
                    log.warning('The Apify Proxy password you provided belongs to'
                    + ' a different user than the Apify token you are using. Are you sure this is correct?');
                }
            } else {
                this.password = password;
            }
        }
        if (!this.password) {
            throw new Error(`Apify Proxy password must be provided using options.password or the "${ENV_VARS.PROXY_PASSWORD}" environment variable.`
                + `If you add the "${ENV_VARS.TOKEN}" environment variable, the password will be automatically inferred.`);
        }
    }

    /**
     * Checks the status of Apify Proxy and throws an error if the status is not "connected".
     * @returns {Promise<void>}
     * @ignore
     */
    async _checkAccess() {
        const url = APIFY_PROXY_STATUS_URL;
        const proxyUrl = this.newUrl();
        const { countryCode } = this;
        const { body: { connected, connectionError } } = await requestAsBrowser({ url, proxyUrl, countryCode, json: true });
        if (!connected) this._throwApifyProxyConnectionError(connectionError);
    }

    /**
     * Handles custom url rotation with session
     * @param {string} [sessionId]
     * @returns {string} url
     * @ignore
     */
    _handleCustomUrl(sessionId) {
        let customUrlToUse;
        if (sessionId) {
            if (this.usedProxyUrls.has(sessionId)) {
                customUrlToUse = this.usedProxyUrls.get(sessionId);
            } else {
                customUrlToUse = this.proxyUrls[this.nextCustomUrlIndex++ % this.proxyUrls.length];
                this.usedProxyUrls.set(sessionId, customUrlToUse);
            }
        } else {
            customUrlToUse = this.proxyUrls[this.nextCustomUrlIndex++ % this.proxyUrls.length];
        }
        return customUrlToUse;
    }

    /**
     * Calls the custom newUrlFunction and checks format of its return value
     * @param {string} [sessionId]
     * @ignore
     */
    _callNewUrlFunction(sessionId) {
        let proxyUrl;
        try {
            proxyUrl = this.newUrlFunction(sessionId);
            new URL(proxyUrl); // eslint-disable-line no-new
        } catch (err) {
            this._throwNewUrlFunctionInvalid(err);
        }
        return proxyUrl;
    }

    /**
     * Validates session argument structure
     * @param {string} sessionId
     * @ignore
     */
    _validateSessionArgumentStructure(sessionId) {
        if (!APIFY_PROXY_VALUE_REGEX.test(sessionId)) this._throwInvalidProxyValueError('session', sessionId);
        if (sessionId.length > MAX_SESSION_ID_LENGTH) {
            throw new Error(`The provided sessionId must not be longer than ${MAX_SESSION_ID_LENGTH} characters. Received: ${sessionId.length}`);
        }
    }

    /**
     * Validates groups option structure
     * @param {string[]} groups
     * @ignore
     */
    _validateGroupsStructure(groups) {
        for (const group of groups) {
            if (!APIFY_PROXY_VALUE_REGEX.test(group)) this._throwInvalidProxyValueError('group', group);
        }
    }

    /**
     * Validates countryCode option
     * @param {string} countryCode
     * @ignore
     */
    _validateCountryCode(countryCode) {
        if (!COUNTRY_CODE_REGEX.test(countryCode)) this._throwInvalidCountryCode(countryCode);
    }

    /**
     * Validates the structure of all URLs from proxyUrls option
     * @param {string[]} proxyUrls
     * @ignore
     */
    _validateProxyUrls(proxyUrls) {
        if (!proxyUrls.length) this._throwProxyUrlsIsEmpty();
        proxyUrls.forEach((customUrl) => {
            try {
                // eslint-disable-next-line no-new
                new URL(customUrl);
            } catch (err) {
                this._throwInvalidCustomUrl(customUrl);
            }
        });
    }

    /**
     * Throws invalid custom newUrlFunction return
     * @param {Error} err
     * @ignore
     */
    _throwNewUrlFunctionInvalid(err) {
        throw new Error(`The provided newUrlFunction did not return a valid URL.\nCause: ${err.message}`);
    }

    /**
     * Throws invalid proxy value error
     * @param {string} param
     * @param {string} value
     * @ignore
     */
    _throwInvalidProxyValueError(param, value) {
        throw new Error(`The provided proxy ${param} name "${value}" can only contain the following characters: 0-9, a-z, A-Z, ".", "_" and "~"`);
    }

    /**
     * Throws invalid country code error
     * @param {string} code
     * @ignore
     */
    _throwInvalidCountryCode(code) {
        throw new Error(`The provided country code "${code}" is not valid. Please use a two letter country code according to ISO 3166-1 alpha-2`);
    }

    /**
     * Throws Apify Proxy is not connected
     * @ignore
     */
    _throwApifyProxyConnectionError(errorMessage) {
        throw new Error(errorMessage);
    }

    /**
     * Throws custom URLs is provided but empty
     * @ignore
     */
    _throwProxyUrlsIsEmpty() {
        throw new Error('Parameter "options.proxyUrls" of type Array must not be empty!');
    }

    /**
     * Throws cannot combine custom proxies with Apify Proxy
     * @ignore
     */
    _throwCannotCombineCustomWithApify() {
        throw new Error('Cannot combine custom proxies with Apify Proxy!'
            + 'It is not allowed to set "options.proxyUrls" or "options.newUrlFunction" combined with '
            + '"options.groups" or "options.apifyProxyGroups" and "options.countryCode" or "options.apifyProxyCountry".');
    }

    /**
     * Throws cannot combine custom 2 custom methods
     * @ignore
     */
    _throwCannotCombineCustomMethods() {
        throw new Error('Cannot combine custom proxies "options.proxyUrls" with custom generating function "options.newUrlFunction".');
    }

    /**
     * Throws invalid custom proxy URL
     * @param {string} url
     * @ignore
     */
    _throwInvalidCustomUrl(url) {
        throw new Error(`The provided proxy URL "${url}" is not a valid URL.`);
    }
}

/**
 * Creates a proxy configuration and returns a promise resolving to an instance
 * of the {@link ProxyConfiguration} class that is already initialized.
 *
 * Configures connection to a proxy server with the provided options. Proxy servers are used to prevent target websites from blocking
 * your crawlers based on IP address rate limits or blacklists. Setting proxy configuration in your crawlers automatically configures
 * them to use the selected proxies for all connections.
 *
 * For more details and code examples, see the {@link ProxyConfiguration} class.
 *
 * ```javascript
 *
 * // Returns initialized proxy configuration class
 * const proxyConfiguration = await Apify.createProxyConfiguration({
 *     groups: ['GROUP1', 'GROUP2'] // List of Apify proxy groups
 *     countryCode: 'US'
 * });
 *
 * const crawler = new Apify.CheerioCrawler({
 *   // ...
 *   proxyConfiguration,
 *   handlePageFunction: ({ proxyInfo }) => {
 *       const usedProxyUrl = proxyInfo.url; // Getting the proxy URL
 *   }
 * })
 *
 * ```
* @param {ProxyConfigurationOptions} [proxyConfigurationOptions]
* @returns {Promise<ProxyConfiguration>}
* @memberof module:Apify
* @name createProxyConfiguration
* @function
    */
export const createProxyConfiguration = async (proxyConfigurationOptions) => {
    const proxyConfiguration = new ProxyConfiguration(proxyConfigurationOptions);
    await proxyConfiguration.initialize();

    return proxyConfiguration;
};
