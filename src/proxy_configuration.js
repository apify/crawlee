import { checkParamOrThrow } from 'apify-client/build/utils';
import { ENV_VARS, LOCAL_ENV_VARS } from 'apify-shared/consts';
import { APIFY_PROXY_VALUE_REGEX } from 'apify-shared/regexs';
import { COUNTRY_CODE_REGEX } from './constants';
import { apifyClient } from './utils';
import { requestAsBrowser } from './utils_request';
import log from './utils_log';

// CONSTANTS
const PROTOCOL = 'http';
const APIFY_PROXY_STATUS_URL = 'http://proxy.apify.com/?format=json';

/**
 * @typedef ProxyConfigurationOptions
 * @property {string} [password] - User's password for the proxy. By default, it is taken from the `APIFY_PROXY_PASSWORD`
 *   environment variable, which is automatically set by the system when running the actors.
 * @property {string[]} [groups] - An array of proxy groups to be used
 *   by the [Apify Proxy](https://docs.apify.com/proxy). If not provided, the proxy will select
 *   the groups automatically.
 * @property {string} [countryCode] - If set and relevant proxies are available in your Apify account, all proxied requests will
 *   use IP addresses that are geolocated to the specified country. For example `GB` for IPs
 *   from Great Britain. Note that online services often have their own rules for handling
 *   geolocation and thus the country selection is a best attempt at geolocation, rather than
 *   a guaranteed hit. This parameter is optional, by default, each proxied request is assigned
 *   an IP address from a random country. The country code needs to be a two letter ISO country code. See the
 *   [full list of available country codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2#Officially_assigned_code_elements).
 *   This parameter is optional, by default, the proxy uses all available proxy servers from all countries.
 *   on the Apify cloud, or when using the [Apify CLI](https://github.com/apifytech/apify-cli).
 * @property {string[]} [apifyProxyGroups] - Same option as `groups` which can be used to
 *  configurate the proxy by UI input schema. You should use the `groups` option in your crawler code.
 * @property {string} [apifyProxyCountry] - Same option as `countryCode` which can be used to
 *  configurate the proxy by UI input schema. You should use the `countryCode` option in your crawler code.
 */

/**
 * The main purpose of the ProxyInfo object is to provide information
 * about the proxy used by the crawler for the current request.
 * Outside of crawlers, you can get this object by calling {@link ProxyConfiguration.getInfo}.
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
 * const proxyInfo = proxyConfiguration.getInfo();
 *
 * // In crawler
 * const crawler = new Apify.CheerioCrawler({
 *   // ...
 *   proxyConfiguration,
 *   handlePageFunction: ({ proxyInfo }) => {
 *      // Getting used Proxy URL
 *       const proxyUrl = proxyInfo.url;
 *
 *      // Getting ID of used Session
 *       const sessionIdentifier = proxyInfo.sessionId;
 *   }
 * })
 *
 * ```
 * @typedef ProxyInfo
 * @property {string} [sessionId] - The identifier of used {@link Session}, if used.
 * @property {string} url - The proxy URL.
 * @property {string[]} groups - An array of proxy groups to be used
 *   by the [Apify Proxy](https://docs.apify.com/proxy). If not provided, the proxy will select
 *   the groups automatically.
 * @property {string} [countryCode] - If set and relevant proxies are available in your Apify account, all proxied requests will
 *   use IP addresses that are geolocated to the specified country. For example `GB` for IPs
 *   from Great Britain. Note that online services often have their own rules for handling
 *   geolocation and thus the country selection is a best attempt at geolocation, rather than
 *   a guaranteed hit. This parameter is optional, by default, each proxied request is assigned
 *   an IP address from a random country. The country code needs to be a two letter ISO country code. See the
 *   [full list of available country codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2#Officially_assigned_code_elements).
 *   This parameter is optional, by default, the proxy uses all available proxy servers from all countries.
 * @property {string} password - User's password for the proxy. By default, it is taken from the `APIFY_PROXY_PASSWORD`
 *   environment variable, which is automatically set by the system when running the actors
 *   on the Apify cloud, or when using the [Apify CLI](https://github.com/apifytech/apify-cli).
 * @property {string} hostname - Hostname of your proxy.
 * @property {string} port - Proxy port.
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
 *      const usedProxyUrl = proxyInfo.url; // Getting the Proxy URL
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
            password = process.env[ENV_VARS.PROXY_PASSWORD],
        } = options;

        const groupsToUse = groups.length ? groups : apifyProxyGroups;
        const countryCodeToUse = countryCode || apifyProxyCountry;
        const hostname = process.env[ENV_VARS.PROXY_HOSTNAME] || LOCAL_ENV_VARS[ENV_VARS.PROXY_HOSTNAME];
        const port = Number(process.env[ENV_VARS.PROXY_PORT] || LOCAL_ENV_VARS[ENV_VARS.PROXY_PORT]);

        // Validation
        checkParamOrThrow(groupsToUse, 'opts.groups', '[String]');
        checkParamOrThrow(countryCodeToUse, 'opts.countryCode', 'Maybe String');
        checkParamOrThrow(password, 'opts.password', 'Maybe String');
        this._validateArgumentStructure(groupsToUse, countryCodeToUse);

        this.groups = groupsToUse;
        this.countryCode = countryCodeToUse;
        this.password = password;
        this.hostname = hostname;
        this.port = port;
    }

    /**
     * Loads proxy password if token is provided and checks access to Apify Proxy and provided proxy groups.
     * Also checks if country has access to Apify Proxy groups if the country code is provided.
     *
     * You should use the {@link Apify.createProxyConfiguration} function to create a pre-initialized
     * `ProxyConfiguration` instance instead of calling this manually.
     *
     * @returns {Promise<void>}
     */
    async initialize() {
        await this._setPasswordIfToken();

        await this._checkAccess();

        // TODO: Validate proxyUrl each of custom proxies
    }


    /**
     * Gets information about proxy and its configuration.
     * @param {string} sessionId
     *  Apify Proxy [Session](https://docs.apify.com/proxy/datacenter-proxy#session-persistence) identifier
     *  to be used with requests.
     *  All HTTP requests going through the proxy with the same session identifier
     *  will use the same target proxy server (i.e. the same IP address).
     *  The identifier can only contain the following characters: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
     * @return {ProxyInfo} represents information about used proxy configuration.
     */
    getInfo(sessionId) {
        if (sessionId) this._validateSessionArgumentStructure(sessionId);
        const { groups, countryCode, password, port, hostname } = this;
        const url = this.getUrl(sessionId);

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
     * Returns the proxy URL.
     * @param {string} sessionId
     *  Apify Proxy [Session](https://docs.apify.com/proxy/datacenter-proxy#session-persistence) identifier
     *  to be used with requests.
     *  All HTTP requests going through the proxy with the same session identifier
     *  will use the same target proxy server (i.e. the same IP address).
     *  The identifier can only contain the following characters: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
     * @return {string} represents the proxy URL.
     */
    getUrl(sessionId) {
        if (sessionId) this._validateSessionArgumentStructure(sessionId);
        const username = this._getUsername(sessionId);
        const { password, hostname, port } = this;

        return `${PROTOCOL}://${username}:${password}@${hostname}:${port}`;
    }

    /**
     * Returns proxy username.
     * @return {string} the proxy username
     * @param {string} sessionId
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
            throw new Error(`Apify Proxy password must be provided using options.password or the "${ENV_VARS.PROXY_PASSWORD}" environment variable!`);
        }
    }

    /**
     * Checks the status of Apify Proxy and throws an error if the status is not "connected".
     * @returns {Promise<void>}
     * @ignore
     */
    async _checkAccess() {
        const url = APIFY_PROXY_STATUS_URL;
        const proxyUrl = this.getUrl();
        const { countryCode } = this;
        const { body: { connected, connectionError } } = await requestAsBrowser({ url, proxyUrl, countryCode, json: true });
        if (!connected) this._throwApifyProxyConnectionError(connectionError);
    }

    /**
     * Validates session argument structure
     * @param {string} sessionId
     * @ignore
     */
    _validateSessionArgumentStructure(sessionId) {
        if (!APIFY_PROXY_VALUE_REGEX.test(sessionId)) this._throwInvalidProxyValueError(sessionId);
    }

    /**
     * Validates groups and countryCode options correct structure
     * @param {string[]} groups
     * @param {string} countryCode
     * @ignore
     */
    _validateArgumentStructure(groups, countryCode) {
        for (const group of groups) {
            if (!APIFY_PROXY_VALUE_REGEX.test(group)) this._throwInvalidProxyValueError(group);
        }
        if (countryCode) {
            if (!COUNTRY_CODE_REGEX.test(countryCode)) this._throwInvalidCountryCode(countryCode);
        }
    }

    /**
     * Throws invalid proxy value error
     * @param {string} param
     * @ignore
     */
    _throwInvalidProxyValueError(param) {
        throw new Error(`The provided proxy group name "${param}" can only contain the following characters: 0-9, a-z, A-Z, ".", "_" and "~"`);
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
 *       const usedProxyUrl = proxyInfo.url; // Getting the Proxy URL
 *   }
 * })
 *
 * ```
* @param {ProxyConfigurationOptions} proxyConfigurationOptions
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
