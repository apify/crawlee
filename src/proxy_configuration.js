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
 * @property {string[]} [groups] - An array of proxy groups to be used
 *   by the [Apify Proxy](https://docs.apify.com/proxy).
 * @property {string} [countryCode] - Two letter country code according to ISO 3166-1 alpha-2.
 * @property {string} [password] - Password to your proxy.
 * @property {string} [hostname] - Hostname of your proxy.
 * @property {string} [port] - Proxy port.
 *
 * @property {string[]} [apifyProxyGroups] - Same option as `groups` which can be used to
 *  configurate the proxy by UI input schema. You should use the `groups` option in your crawler code.
 * @property {string} [apifyProxyCountry] - Same option as `countryCode` which can be used to
 *  configurate the proxy by UI input schema. You should use the `countryCode` option in your crawler code.
 */

/**
 * @typedef ProxyInfo
 * @property {string} [sessionId] - The identifier of used {@link Session}
 * @property {string} [url] - The proxy URL
 * @property {string[]} [groups] - An array of proxy groups to be used
 *   by the [Apify Proxy](https://docs.apify.com/proxy).
 * @property {string} [countryCode] - Two letter country code according to ISO 3166-1 alpha-2.
 * @property {string} [password] - Password to your proxy.
 * @property {string} [hostname] - Hostname of your proxy.
 * @property {string} [port] - Proxy port.
 *
 */

/**
 * Creates configuration with the proxy options to be used for preventing IP address-based blocking of
 * your web crawling bots by target websites. Setting proxy configuration allows you to get proxy information
 * in your crawlers page function. It is also possible to get only the proxy URL or all proxy information by calling
 * interface methods of this class.
 *
 * **Example usage:**
 *
 * ```javascript
 *
 * // You can use class constructor to create the configuration
 * const proxyConfiguration = new ProxyConfiguration({
 *     groups: ['GROUP1', 'GROUP2'] // List of Apify proxy groups
 *     countryCode: 'CZ',
 *     password: 'password123' // Your Apify proxy password
 *     hostname: 'proxy.apify.com'
 *     port: 8000
 * });
 *
 * // But you have to initialize it before using
 * await proxyConfiguration.initialize();
 *
 * // Or you can just use Apify.createProxyConfiguration(opts)
 * // which returns already initialized proxy configuration
 *
 * const session = new Session(); // To get session id
 *
 * // Now you are able to get proxy URL
 * const proxyUrl = proxyConfiguration.getUrl(session.id);
 *
 * // If you want to get all options of configured proxy
 * const proxyInfo = proxyConfiguration.getInfo(session.id);
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
            groups,
            apifyProxyGroups,
            countryCode,
            apifyProxyCountry,
            password = process.env[ENV_VARS.PROXY_PASSWORD],
            hostname = process.env[ENV_VARS.PROXY_HOSTNAME] || LOCAL_ENV_VARS[ENV_VARS.PROXY_HOSTNAME],
            port = Number(process.env[ENV_VARS.PROXY_PORT] || LOCAL_ENV_VARS[ENV_VARS.PROXY_PORT]),
        } = options;

        const groupsToUse = !groups && apifyProxyGroups ? apifyProxyGroups : groups;
        const countryCodeToUse = !countryCode && apifyProxyCountry ? apifyProxyCountry : countryCode;

        // Validation
        checkParamOrThrow(groupsToUse, 'opts.groups', 'Maybe [String]');
        checkParamOrThrow(countryCodeToUse, 'opts.countryCode', 'Maybe String');
        checkParamOrThrow(password, 'opts.password', 'Maybe String');
        checkParamOrThrow(hostname, 'opts.hostname', 'String', this._getMissingParamErrorMgs('hostname', ENV_VARS.PROXY_HOSTNAME));
        checkParamOrThrow(port, 'opts.port', 'Number', this._getMissingParamErrorMgs('port', ENV_VARS.PROXY_PORT));
        this._validateArgumentStructure(groups, countryCode);

        this.groups = groupsToUse;
        this.countryCode = countryCodeToUse;
        this.password = password;
        this.hostname = hostname;
        this.port = port;
    }

    /**
     * Loads proxy password if token is provided and checks access to Apify Proxy and provided proxy groups.
     * Also checks if country has access to Apify Proxy groups if the country code is provided.
     * This function must be called before you can start using the instance in a meaningful way.
     *
     * @returns {Promise<void>}
     */
    async initialize() {
        // Set or checks the proxy password via API if token is provided
        await this._setPasswordIfToken();

        // Check if user has access to apify proxy and selected proxy groups
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
        const username = this._getUsername(sessionId);
        const { password, hostname, port } = this;

        return `${PROTOCOL}://${username}:${password}@${hostname}:${port}`;
    }

    /**
     *  Returns proxy username.
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
     *  Checks if Apify Token is provided in env
     *  and gets the password via API and sets it to env
     * @returns {Promise<void>}
     * @ignore
     */
    async _setPasswordIfToken() {
        const token = process.env[ENV_VARS.TOKEN] || LOCAL_ENV_VARS[ENV_VARS.TOKEN];
        if (token) {
            const { proxy: { password } } = await apifyClient.users.getUser({ token, userId: 'me' });
            if (this.password) {
                if (this.password !== password) log.warning('Your set Apify Proxy password does not match your Apify Token.');
            } else {
                this.password = password;
            }
        } else if (!this.password) {
            throw new Error(this._getMissingParamErrorMgs('password', ENV_VARS.PROXY_PASSWORD));
        }
    }

    /**
     *  Checks the status of Apify Proxy and throws an error if the status is not "connected".
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
     *  Validates if parameters groups and countryCode have correct structure
     * @ignore
     */
    _validateArgumentStructure(groups, countryCode) {
        if (groups && groups.length) {
            for (const group of groups) {
                if (!APIFY_PROXY_VALUE_REGEX.test(group)) this._throwInvalidProxyValueError(group);
            }
        }
        if (countryCode) {
            if (!COUNTRY_CODE_REGEX.test(countryCode)) this._throwInvalidCountryCode(countryCode);
        }
    }

    /**
     *  Returns missing parameter error message.
     * @param {string} param
     * @param {string} env
     * @return {string} - error message
     * @ignore
     */
    _getMissingParamErrorMgs(param, env) {
        return `Apify Proxy ${param} must be provided as parameter or "${env}" environment variable!`;
    }

    /**
     *  Throws invalid proxy value error
     * @param {string} param
     * @ignore
     */
    _throwInvalidProxyValueError(param) {
        throw new Error(`The provided proxy group name "${param}" can only contain the following characters: 0-9, a-z, A-Z, ".", "_" and "~"`);
    }

    /**
     *  Throws invalid country code error
     * @param {string} code
     * @ignore
     */
    _throwInvalidCountryCode(code) {
        throw new Error(`The provided country code "${code}" is not valid. Please use a two letter country code according to ISO 3166-1 alpha-2`);
    }

    /**
     *  Throws Apify Proxy is not connected
     * @ignore
     */
    _throwApifyProxyConnectionError(errorMessage) {
        throw new Error(errorMessage);
    }
}

/**
 *  Creates a proxy configuration and returns a promise resolving to an instance
 *  of the {@link ProxyConfiguration} class that is already initialized.
 *
 *  Factory function which gets the {ProxyConfigurationOptions} proxyConfigurationOptions as a parameter and returns
 *  preconfigured {@link ProxyConfiguration} with already passed all check and validations so it should  be save
 *  to use it as a configuration for your crawler and call its methods.
 *
 *  For more details and code examples, see the {@link ProxyConfiguration} class.
 *
 *  ```javascript
 *
 *  // Returns initialized proxy configuration class
 *  const proxyConfiguration = Apify.createProxyConfiguration({
 *      groups: ['GROUP1', 'GROUP2'] // List of Apify proxy groups
 *      countryCode: 'CZ',
 *      password: 'password123' // Your Apify proxy password
 *      hostname: 'proxy.apify.com'
 *      port: 8000
 *  });
 *
 *  ```
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
