/**
 * Persistable {@link Session} state.
 * @typedef {Object} SessionState
 * @property {string} id
 * @property {Object} cookieJar
 * @property {Object} userData
 * @property {number} errorScore
 * @property {number} maxErrorScore
 * @property {number} errorScoreDecrement
 * @property {number} usageCount
 * @property {string} expiresAt
 * @property {string} createdAt
 */
/**
 * @typedef {Object} SessionOptions
 * @property {string} [id] - Id of session used for generating fingerprints. It is used as proxy session name.
 * @property {number} [maxAgeSecs=3000] - Number of seconds after which the session is considered as expired.
 * @property {Object} userData - Object where custom user data can be stored. For example custom headers.
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
 */
export class Session {
    /**
     * Session configuration.
     * @param {SessionOptions} options
     */
    constructor(options?: SessionOptions);
    /**
     * @type CookieJar
     * @private
     * */
    cookieJar: CookieJar;
    id: string;
    maxAgeSecs: number;
    userData: any;
    maxErrorScore: number;
    errorScoreDecrement: number;
    expiresAt: Date;
    createdAt: Date;
    usageCount: number;
    errorScore: any;
    maxUsageCount: number;
    sessionPool: SessionPool;
    /**
     * indicates whether the session is blocked.
     * Session is blocked once it reaches the `maxErrorScore`.
     * @return {boolean}
     */
    isBlocked(): boolean;
    /**
     * Indicates whether the session is expired.
     * Session expiration is determined by the `maxAgeSecs`.
     * Once the session is older than `createdAt + maxAgeSecs` the session is considered expired.
     * @return {boolean}
     */
    isExpired(): boolean;
    /**
     * Indicates whether the session is used maximum number of times.
     * Session maximum usage count can be changed by `maxUsageCount` parameter.
     * @return {boolean}
     */
    isMaxUsageCountReached(): boolean;
    /**
     * Indicates whether the session can be used for next requests.
     * Session is usable when it is not expired, not blocked and the maximum usage count has not be reached.
     * @return {boolean}
     */
    isUsable(): boolean;
    /**
     * This method should be called after a successful session usage.
     * It increases `usageCount` and potentially lowers the `errorScore` by the `errorScoreDecrement`.
     */
    markGood(): void;
    /**
     * Gets session state for persistence in KeyValueStore.
     * @return {SessionState} represents session internal state.
     */
    getState(): SessionState;
    /**
     * Marks session as blocked and emits event on the `SessionPool`
     * This method should be used if the session usage was unsuccessful
     * and you are sure that it is because of the session configuration and not any external matters.
     * For example when server returns 403 status code.
     * If the session does not work due to some external factors as server error such as 5XX you probably want to use `markBad` method.
     */
    retire(): void;
    /**
     * Increases usage and error count.
     * Should be used when the session has been used unsuccessfully. For example because of timeouts.
     */
    markBad(): void;
    /**
     * With certain status codes: `401`, `403` or `429` we can be certain
     * that the target website is blocking us. This function helps to do this conveniently
     * by retiring the session when such code is received. Optionally the default status
     * codes can be extended in the second parameter.
     * @param statusCode {number} - HTTP status code
     * @param [blockedStatusCodes] {number[]} - Custom HTTP status codes that means blocking on particular website.
     * @return {boolean} whether the session was retired.
     */
    retireOnBlockedStatusCodes(statusCode: number, blockedStatusCodes?: number[]): boolean;
    /**
     * Saves cookies from an HTTP response to be used with the session.
     * It expects an object with a `headers` property that's either an `Object`
     * (typical Node.js responses) or a `Function` (Puppeteer Response).
     *
     * It then parses and saves the cookies from the `set-cookie` header, if available.
     * @param {{ headers }} response
     */
    setCookiesFromResponse(response: {
        headers: any;
    }): void;
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
     * @param cookies {PuppeteerCookie[]}
     * @param url {string}
     */
    setPuppeteerCookies(cookies: PuppeteerCookie[], url: string): void;
    /**
     * Returns cookies in a format compatible with puppeteer and ready to be used with `page.setCookie`.
     * @param url {String} - website url. Only cookies stored for this url will be returned
     * @return {PuppeteerCookie[]}
     */
    getPuppeteerCookies(url: string): PuppeteerCookie[];
    /**
     * Returns cookies saved with the session in the typical
     * key1=value1; key2=value2 format, ready to be used in
     * a cookie header or elsewhere.
     * @param {string} url
     * @return {string} - represents `Cookie` header.
     */
    getCookieString(url: string): string;
    /**
     * Transforms puppeteer cookie to tough-cookie.
     * @param puppeteerCookie {PuppeteerCookie} - Cookie from puppeteer `page.cookies method.
     * @return {Cookie}
     * @private
     */
    _puppeteerCookieToTough(puppeteerCookie: PuppeteerCookie): Cookie;
    /**
     * Transforms tough-cookie to puppeteer cookie .
     * @param {Cookie} toughCookie - Cookie from CookieJar
     * @return {PuppeteerCookie} - Cookie from Puppeteer
     * @private
     */
    _toughCookieToPuppeteer(toughCookie: Cookie): PuppeteerCookie;
    /**
     * Sets cookies.
     * @param {Cookie[]} cookies
     * @param {string} url
     * @private
     */
    _setCookies(cookies: Cookie[], url: string): void;
}
/**
 * Persistable {@link Session} state.
 */
export type SessionState = {
    id: string;
    cookieJar: any;
    userData: any;
    errorScore: number;
    maxErrorScore: number;
    errorScoreDecrement: number;
    usageCount: number;
    expiresAt: string;
    createdAt: string;
};
export type SessionOptions = {
    /**
     * - Id of session used for generating fingerprints. It is used as proxy session name.
     */
    id?: string;
    /**
     * - Number of seconds after which the session is considered as expired.
     */
    maxAgeSecs?: number;
    /**
     * - Object where custom user data can be stored. For example custom headers.
     */
    userData: any;
    /**
     * - Maximum number of marking session as blocked usage.
     * If the `errorScore` reaches the `maxErrorScore` session is marked as block and it is thrown away.
     * It starts at 0. Calling the `markBad` function increases the `errorScore` by 1.
     * Calling the `markGood` will decrease the `errorScore` by `errorScoreDecrement`
     */
    maxErrorScore?: number;
    /**
     * - It is used for healing the session.
     * For example: if your session is marked bad two times, but it is successful on the third attempt it's errorScore is decremented by this
     * number.
     */
    errorScoreDecrement?: number;
    /**
     * - Date of creation.
     */
    createdAt?: Date;
    /**
     * - Date of expiration.
     */
    expiresAt?: Date;
    /**
     * - Indicates how many times the session has been used.
     */
    usageCount?: number;
    /**
     * - Indicates how many times the session is marked bad.
     */
    errorCount?: number;
    /**
     * - Session should be used only a limited amount of times.
     * This number indicates how many times the session is going to be used, before it is thrown away.
     */
    maxUsageCount?: number;
    /**
     * - SessionPool instance. Session will emit the `sessionRetired` event on this instance.
     */
    sessionPool: SessionPool;
};
import { CookieJar } from "tough-cookie";
import { SessionPool } from "./session_pool";
import { Cookie as PuppeteerCookie } from "puppeteer";
import { Cookie } from "tough-cookie";
