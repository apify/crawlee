import { checkParamOrThrow } from 'apify-client/build/utils';
import { ENV_VARS, LOCAL_ENV_VARS } from 'apify-shared/consts';
import { APIFY_PROXY_VALUE_REGEX } from 'apify-shared/regexs';
import { COUNTRY_CODE_REGEX } from './constants';
import { apifyClient } from './utils';
import { requestAsBrowser } from './utils_request';

// CONSTANTS
const PROTOCOL = 'http';
const APIFY_PROXY_STATUS_URL = 'http://proxy.apify.com/?format=json';

/**
 * @typedef ProxyConfigurationOptions
 * @property {Array} [groups] - List of Apify proxy group names.
 * @property {number} [sessionId] - Proxy session ID.
 * @property {string} [country] - Two letter country code according to ISO 3166-1 alpha-2.
 * @property {string} [password] - Password to your proxy.
 * @property {string} [hostname] - Hostname of your proxy.
 * @property {string} [port] - Proxy port.
 */

/**
 * Proxies help prevent IP address-based blocking of your web crawling bots by target websites.
 * The service provides access to Apify's pool of residential and datacenter IP addresses,
 * and lets you find the right balance between performance and cost.
 *
 */
export class ProxyConfiguration {
    /**
     * Proxy Configuration.
     *
     * @param {ProxyConfigurationOptions} options
     */
    constructor(options = {}) {
        const {
            groups,
            country,
            password = process.env[ENV_VARS.PROXY_PASSWORD],
            hostname = process.env[ENV_VARS.PROXY_HOSTNAME] || LOCAL_ENV_VARS[ENV_VARS.PROXY_HOSTNAME],
            port = parseInt(process.env[ENV_VARS.PROXY_PORT] || LOCAL_ENV_VARS[ENV_VARS.PROXY_PORT], 10),
        } = options;

        // Validation
        checkParamOrThrow(groups, 'opts.groups', 'Maybe [String]');
        checkParamOrThrow(country, 'opts.country', 'Maybe String');
        checkParamOrThrow(password, 'opts.password', 'Maybe String');
        checkParamOrThrow(hostname, 'opts.hostname', 'String', this._getMissingParamErrorMgs('hostname', ENV_VARS.PROXY_HOSTNAME));
        checkParamOrThrow(port, 'opts.port', 'Number', this._getMissingParamErrorMgs('port', ENV_VARS.PROXY_PORT));
        this._validateArgumentsStructure();

        this.groups = groups;
        this.country = country;
        this.password = password;
        this.hostname = hostname;
        this.port = port;
        this.availableGroups = [];
    }

    /**
     * Loads all remote sources of URLs and potentially starts periodic state persistence.
     * This function must be called before you can start using the instance in a meaningful way.
     *
     * @returns {Promise<void>}
     */
    async initialize() {
        // Set proxy password via API if token is provided
        await this._setPasswordIfToken();

        // Check if user has access to apify proxy
        await this._checkAccessRights();

        // Check if user has access to selected proxy group
        await this._checkAccessToProxyGroups();

        // TODO: Validate proxyUrl each of custom proxies
    }


    /**
     * Gets information about proxy and its configuration.
     * @param {string} sessionId
     * @return {object} represents information about proxy.
     */
    getInfo(sessionId) {
        const { groups, country, password, port, hostname } = this;
        const username = this._getUsername(sessionId);

        return {
            sessionId,
            groups,
            country,
            username,
            password,
            hostname,
            port,
        };
    }

    /**
     * Returns proxy url.
     * @param {string} sessionId
     * @return {string} - the proxy url
     */
    getUrl(sessionId) {
        const username = this._getUsername(sessionId);
        const { password, hostname, port } = this;

        return `${PROTOCOL}://${username}:${password}@${hostname}:${port}`;
    }

    /**
     * Returns proxy username.
     * @return {string} - the proxy username
     * @param {string} sessionId
     * @private
     */
    _getUsername(sessionId) {
        let username;
        const { groups, country } = this;
        if (groups || sessionId || country) {
            const parts = [];

            if (groups && groups.length) {
                parts.push(`groups-${groups.join('+')}`);
            }
            if (sessionId) {
                parts.push(`session-${sessionId}`);
            }
            if (country) {
                parts.push(`country-${country}`);
            }

            username = parts.join(',');
        } else {
            username = 'auto';
        }
        return username;
    }

    /**
     * Checks if apify token is provided in env
     * and gets the password via API and sets it to env
     * @returns {Promise<void>}
     * @private
     */
    async _setPasswordIfToken() {
        const token = process.env[ENV_VARS.TOKEN];
        if (token && !this.password) {
            const { proxy: { password, groups } } = await apifyClient.users.getUser({ token });
            process.env[ENV_VARS.PROXY_PASSWORD] = password; // is this necessary here?
            this.password = password;
            this.availableGroups = groups;
        } else if (!token && !this.password) {
            throw new Error(this._getMissingParamErrorMgs('password', ENV_VARS.PROXY_PASSWORD));
        }
    }

    /**
     * Checks the status of apify proxy and
     * throws an access denied error if the status is not "connected"
     * @returns {Promise<void>}
     * @private
     */
    async _checkAccessRights() {
        const url = APIFY_PROXY_STATUS_URL;
        const proxyUrl = this.getUrl();
        const countryCode = this.country;
        const { body } = await requestAsBrowser({ url, proxyUrl, countryCode });
        const parsedBody = JSON.parse(body);
        if (!parsedBody.connected) this._throwApifyProxyNotConnected();
    }

    /**
     * Checks if user has access to each of passed proxy groups
     * from user object proxy groups and throws error if not
     * @returns {Promise<void>}
     * @private
     */
    async _checkAccessToProxyGroups() {
        if (this.groups && this.groups.length && this.availableGroups && this.availableGroups.length) {
            for (const passedGroupName of this.availableGroups) {
                if (!this.availableGroups.find(availableGroup => availableGroup.name === passedGroupName)) {
                    this._throwGroupIsNotAvailable(passedGroupName);
                }
            }
        }
    }

    /**
     * Validates if parameters groups, sessionId and country have correct structure
     * @private
     */
    _validateArgumentsStructure() {
        const { groups, sessionId, country } = this;
        if (groups && groups.length) {
            if (!groups.every(group => APIFY_PROXY_VALUE_REGEX.test(group))) this._throwInvalidProxyValueError('groups');
        }
        if (sessionId) {
            if (!APIFY_PROXY_VALUE_REGEX.test(sessionId)) this._throwInvalidProxyValueError('session');
            if (sessionId.toString().length > 50) this._throwSessionIdIsTooLong();
        }
        if (country) {
            if (!COUNTRY_CODE_REGEX.test(country)) this._throwInvalidCountryCode(country);
        }
    }

    /**
     * Returns missing parameter error message.
     * @param {string} param
     * @param {string} env
     * @return {string} - error message
     * @private
     */
    _getMissingParamErrorMgs(param, env) {
        return `Apify Proxy ${param} must be provided as parameter or "${env}" environment variable!`;
    }

    /**
     * Throws invalid proxy value error
     * @param {string} param
     * @private
     */
    _throwInvalidProxyValueError(param) {
        throw new Error(`The "${param}" option can only contain the following characters: 0-9, a-z, A-Z, ".", "_" and "~"`);
    }

    /**
     * Throws invalid country code error
     * @param {string} code
     * @private
     */
    _throwInvalidCountryCode(code) {
        throw new Error(`The "${code}" option must be a valid two letter country code according to ISO 3166-1 alpha-2`);
    }

    /**
     * Throws access to apify proxy was denied
     * @private
     */
    _throwApifyProxyNotConnected() {
        throw new Error('You do not have access rights to Apify Proxy. It is possible that your trial is expired '
            + 'or any of proxy limitation was exceeded.');
    }

    /**
     * Throws proxy group is not available
     * @param {string} group
     * @private
     */
    _throwGroupIsNotAvailable(group) {
        throw new Error(`The proxy group "${group}" is not available for your account. Use different proxy group or `
        + 'upgrade your plan.');
    }

    /**
     * Throws passed session id is too long (max 50 chars)
     * @private
     */
    _throwSessionIdIsTooLong() {
        throw new Error('Passed "sessionId" is too long. The maximum of allowed chars is 50.');
    }
}

/*
* @param {ProxyConfigurationOptions} [options]
* @returns {Promise<RequestList>}
* @memberof module:Apify
* @name createProxyConfiguration
* @function
    */
export const createProxyConfiguration = async (options = {}) => {
    const proxyCofiguration = new ProxyConfiguration({
        ...options,
    });
    await proxyCofiguration.initialize();

    return proxyCofiguration;
};
