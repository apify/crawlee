import { cryptoRandomObjectId } from 'apify-shared/utilities';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { Cookie, CookieJar } from 'tough-cookie';
import EVENTS from './events';
import { STATUS_CODES_BLOCKED } from '../constants';
import { getCookiesFromResponse } from './session_utils';
import defaultLog from '../utils_log';

// TYPE IMPORTS
/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order,import/no-cycle */
import { SessionPool } from './session_pool';
import { Cookie as PuppeteerCookie } from 'puppeteer';
import { IncomingMessage } from 'http';
import { Response as PuppeteerResponse } from 'puppeteer';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order,import/no-cycle */

// CONSTANTS
const DEFAULT_SESSION_MAX_AGE_SECS = 3000;

/**
 * Persistable {@link Session} state.
 * @typedef SessionState
 * @property {string} id
 * @property {CookieJar} cookieJar
 * @property {object} userData
 * @property {number} errorScore
 * @property {number} maxErrorScore
 * @property {number} errorScoreDecrement
 * @property {number} usageCount
 * @property {string} expiresAt
 * @property {string} createdAt
 */

/**
 * @typedef SessionOptions
 * @property {string} [id] - Id of session used for generating fingerprints. It is used as proxy session name.
 * @property {number} [maxAgeSecs=3000] - Number of seconds after which the session is considered as expired.
 * @property {object} [userData] - Object where custom user data can be stored. For example custom headers.
 * @property {number} [maxErrorScore=3] - Maximum number of marking session as blocked usage.
 *   If the `errorScore` reaches the `maxErrorScore` session is marked as block and it is thrown away.
 *   It starts at 0. Calling the `markBad` function increases the `errorScore` by 1.
 *   Calling the `markGood` will decrease the `errorScore` by `errorScoreDecrement`
 * @property {number} [errorScoreDecrement=0.5] - It is used for healing the session.
 *   For example: if your session is marked bad two times, but it is successful on the third attempt it's errorScore is decremented by this
 *   number.
 * @property {Date} [createdAt] - Date of creation.
 * @property {Date} [expiresAt] - Date of expiration.
 * @property {number} [usageCount=0] - Indicates how many times the session has been used.
 * @property {number} [errorCount=0] - Indicates how many times the session is marked bad.
 * @property {number} [maxUsageCount=50] - Session should be used only a limited amount of times.
 *   This number indicates how many times the session is going to be used, before it is thrown away.
 * @property {SessionPool} sessionPool - SessionPool instance. Session will emit the `sessionRetired` event on this instance.
 */

/**
 *  Sessions are used to store information such as cookies and can be used for generating fingerprints and proxy sessions.
 *  You can imagine each session as a specific user, with its own cookies, IP (via proxy) and potentially a unique browser fingerprint.
 *  Session internal state can be enriched with custom user data for example some authorization tokens and specific headers in general.
 *
 */
export class Session {
    /**
     * Session configuration.
     *
     * @param {SessionOptions} options
     */
    constructor(options = {}) {
        const {
            id = `session_${cryptoRandomObjectId(10)}`,
            cookieJar = new CookieJar(),
            maxAgeSecs = DEFAULT_SESSION_MAX_AGE_SECS,
            userData = {},
            maxErrorScore = 3,
            errorScoreDecrement = 0.5,
            createdAt = new Date(),
            usageCount = 0,
            errorScore = 0,
            maxUsageCount = 50,
            sessionPool,
            log = defaultLog,
        } = options;

        const { expiresAt = this._getDefaultCookieExpirationDate(maxAgeSecs) } = options;

        // Validation
        checkParamOrThrow(id, 'options.id', 'String');
        checkParamOrThrow(maxAgeSecs, 'options.maxAgeSecs', 'Number');
        checkParamOrThrow(userData, 'options.userData', 'Object');
        checkParamOrThrow(maxErrorScore, 'options.maxErrorScore', 'Number');
        checkParamOrThrow(expiresAt, 'options.expiresAt', 'Maybe Date');
        checkParamOrThrow(createdAt, 'options.createdAt', 'Date');
        checkParamOrThrow(usageCount, 'options.usageCount', 'Number');
        checkParamOrThrow(errorScore, 'options.errorScore', 'Number');
        checkParamOrThrow(maxUsageCount, 'options.maxUsageCount', 'Number');
        checkParamOrThrow(sessionPool, 'options.sessionPool', 'Object');

        // sessionPool must be instance of SessionPool.
        if (sessionPool.constructor.name !== 'SessionPool') {
            throw new Error('sessionPool must be instance of SessionPool');
        }

        this.log = log.child({ prefix: 'Session' });

        /**
         * @type {CookieJar}
         * @private
         */
        this.cookieJar = cookieJar.setCookie ? cookieJar : CookieJar.fromJSON(JSON.stringify(cookieJar));
        this.id = id;
        this.maxAgeSecs = maxAgeSecs;
        this.userData = userData;
        this.maxErrorScore = maxErrorScore;
        this.errorScoreDecrement = errorScoreDecrement;

        // Internal
        this.expiresAt = expiresAt;
        this.createdAt = createdAt;
        this.usageCount = usageCount; // indicates how many times the session has been used
        this.errorScore = errorScore; // indicates number of markBaded request with the session
        this.maxUsageCount = maxUsageCount;
        this.sessionPool = sessionPool;

        this._puppeteerCookieToTough = this._puppeteerCookieToTough.bind(this);
    }

    /**
     * indicates whether the session is blocked.
     * Session is blocked once it reaches the `maxErrorScore`.
     * @return {boolean}
     */
    isBlocked() {
        return this.errorScore >= this.maxErrorScore;
    }

    /**
     * Indicates whether the session is expired.
     * Session expiration is determined by the `maxAgeSecs`.
     * Once the session is older than `createdAt + maxAgeSecs` the session is considered expired.
     * @return {boolean}
     */
    isExpired() {
        return this.expiresAt <= new Date();
    }

    /**
     * Indicates whether the session is used maximum number of times.
     * Session maximum usage count can be changed by `maxUsageCount` parameter.
     * @return {boolean}
     */
    isMaxUsageCountReached() {
        return this.usageCount >= this.maxUsageCount;
    }

    /**
     * Indicates whether the session can be used for next requests.
     * Session is usable when it is not expired, not blocked and the maximum usage count has not be reached.
     * @return {boolean}
     */
    isUsable() {
        return !this.isBlocked() && !this.isExpired() && !this.isMaxUsageCountReached();
    }

    /**
     * This method should be called after a successful session usage.
     * It increases `usageCount` and potentially lowers the `errorScore` by the `errorScoreDecrement`.
     */
    markGood() {
        this.usageCount += 1;

        if (this.errorScore > 0) {
            this.errorScore -= this.errorScoreDecrement;
        }
    }

    /**
     * Gets session state for persistence in KeyValueStore.
     * @return {SessionState} represents session internal state.
     */
    getState() {
        return {
            id: this.id,
            cookieJar: this.cookieJar.toJSON(),
            userData: this.userData,
            maxErrorScore: this.maxErrorScore,
            errorScoreDecrement: this.errorScoreDecrement,
            expiresAt: this.expiresAt.toISOString(),
            createdAt: this.createdAt.toISOString(),
            usageCount: this.usageCount,
            errorScore: this.errorScore,
        };
    }

    /**
     * Marks session as blocked and emits event on the `SessionPool`
     * This method should be used if the session usage was unsuccessful
     * and you are sure that it is because of the session configuration and not any external matters.
     * For example when server returns 403 status code.
     * If the session does not work due to some external factors as server error such as 5XX you probably want to use `markBad` method.
     */
    retire() {
        // mark it as an invalid by increasing the error score count.
        this.errorScore += this.maxErrorScore;
        this.usageCount += 1;

        // emit event so we can retire browser in puppeteer pool
        this.sessionPool.emit(EVENTS.SESSION_RETIRED, this);
    }

    /**
     * Increases usage and error count.
     * Should be used when the session has been used unsuccessfully. For example because of timeouts.
     */
    markBad() {
        this.errorScore += 1;
        this.usageCount += 1;
    }

    /**
     * With certain status codes: `401`, `403` or `429` we can be certain
     * that the target website is blocking us. This function helps to do this conveniently
     * by retiring the session when such code is received. Optionally the default status
     * codes can be extended in the second parameter.
     * @param statusCode {number} - HTTP status code
     * @param [blockedStatusCodes] {number[]} - Custom HTTP status codes that means blocking on particular website.
     * @return {boolean} whether the session was retired.
     */
    retireOnBlockedStatusCodes(statusCode, blockedStatusCodes = []) {
        const isBlocked = STATUS_CODES_BLOCKED.concat(blockedStatusCodes).includes(statusCode);
        if (isBlocked) {
            this.retire();
        }
        return isBlocked;
    }

    /**
     * Saves cookies from an HTTP response to be used with the session.
     * It expects an object with a `headers` property that's either an `Object`
     * (typical Node.js responses) or a `Function` (Puppeteer Response).
     *
     * It then parses and saves the cookies from the `set-cookie` header, if available.

     * @param {(PuppeteerResponse|IncomingMessage)} response
     */
    setCookiesFromResponse(response) {
        try {
            const cookies = getCookiesFromResponse(response).filter(c => c);

            this._setCookies(cookies, response.url);
        } catch (e) {
            // if invalid Cookie header is provided just log the exception.
            this.log.exception(e, 'Could not get cookies from response');
        }
    }

    /**
     * Saves an array with cookie objects to be used with the session.
     * The objects should be in the format that
     * [Puppeteer uses](https://pptr.dev/#?product=Puppeteer&version=v2.0.0&show=api-pagecookiesurls),
     * but you can also use this function to set cookies manually:
     *
     * ```
     * [
     *   { name: 'cookie1', value: 'my-cookie' },
     *   { name: 'cookie2', value: 'your-cookie' }
     * ]
     * ```
     *
     * @param {PuppeteerCookie[]} cookies
     * @param {string} url
     */
    setPuppeteerCookies(cookies, url) {
        const normalizedCookies = cookies.map(this._puppeteerCookieToTough);
        this._setCookies(normalizedCookies, url);
    }

    /**
     * Returns cookies in a format compatible with puppeteer and ready to be used with `page.setCookie`.
     * @param {string} url website url. Only cookies stored for this url will be returned
     * @return {PuppeteerCookie[]}
     */
    getPuppeteerCookies(url) {
        const cookies = this.cookieJar.getCookiesSync(url);

        return cookies.map(this._toughCookieToPuppeteer);
    }

    /**
     * Returns cookies saved with the session in the typical
     * key1=value1; key2=value2 format, ready to be used in
     * a cookie header or elsewhere.
     * @param {string} url
     * @return {string} - represents `Cookie` header.
     */
    getCookieString(url) {
        return this.cookieJar.getCookieStringSync(url, {});
    }

    /**
     * Transforms puppeteer cookie to tough-cookie.
     * @param {PuppeteerCookie} puppeteerCookie Cookie from puppeteer `page.cookies method.
     * @return {Cookie}
     * @private
     */
    _puppeteerCookieToTough(puppeteerCookie) {
        const isExpiresValid = puppeteerCookie.expires && typeof puppeteerCookie.expires === 'number';
        const expires = isExpiresValid ? new Date(puppeteerCookie.expires * 1000) : this._getDefaultCookieExpirationDate(this.maxAgeSecs);
        const domain = typeof puppeteerCookie.domain === 'string' && puppeteerCookie.domain.startsWith('.')
            ? puppeteerCookie.domain.slice(1)
            : puppeteerCookie.domain;
        return new Cookie({
            key: puppeteerCookie.name,
            value: puppeteerCookie.value,
            expires,
            domain,
            path: puppeteerCookie.path,
            secure: puppeteerCookie.secure,
            httpOnly: puppeteerCookie.httpOnly,
        });
    }

    /**
     * Transforms tough-cookie to puppeteer cookie .
     * @param {Cookie} toughCookie - Cookie from CookieJar
     * @return {PuppeteerCookie} - Cookie from Puppeteer
     * @private
     */
    _toughCookieToPuppeteer(toughCookie) {
        return {
            name: toughCookie.key,
            value: toughCookie.value,
            expires: new Date(toughCookie.expires).getTime(),
            domain: toughCookie.domain,
            path: toughCookie.path,
            secure: toughCookie.secure,
            httpOnly: toughCookie.httpOnly,
        };
    }

    /**
     * Sets cookies.
     * @param {Cookie[]} cookies
     * @param {string} url
     * @private
     */
    _setCookies(cookies, url) {
        const errorMessages = [];
        for (const cookie of cookies) {
            try {
                this.cookieJar.setCookieSync(cookie, url, { ignoreError: false });
            } catch (e) {
                errorMessages.push(e.message);
            }
        }
        // if invalid cookies are provided just log the exception. No need to retry the request automatically.
        if (errorMessages.length) {
            this.log.error('Could not set cookies.', { errorMessages });
        }
    }

    /**
     * Calculate cookie expiration date
     * @return {Date} - calculated date by session max age seconds.
     * @private
     */
    _getDefaultCookieExpirationDate(maxAgeSecs) {
        return new Date(Date.now() + (maxAgeSecs * 1000));
    }
}
