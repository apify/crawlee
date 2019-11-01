/**
 *  Sessions are used to store information such as cookies and can be used for generating fingerprints and proxy sessions.
 *  You can imagine each session as a specific user, with its own cookies, IP (via proxy) and potentially a unique browser fingerprint.
 *  Session internal state can be enriched with custom user data for example some authorization tokens and specific headers in general.
 */
export class Session {
    /**
     * Session configuration.
     * @param [options.id] {String} - Id of session used for generating fingerprints. It is used as proxy session name.
     * @param [options.maxAgeSecs=3000] {Number} - Number of seconds after which the session is considered as expired.
     * @param options.userData {Object} - Object where custom user data can be stored. For example custom headers.
     * @param [options.maxErrorScore=3] {number} - Maximum number of marking session as blocked usage.
     * If the `errorScore` reaches the `maxErrorScore` session is marked as block and it is thrown away.
     * It starts at 0. Calling the `markBad` function increases the `errorScore` by 1.
     * Calling the `markGood` will decrease the `errorScore` by `errorScoreDecrement`
     * @param [options.errorScoreDecrement=0.5] {number} - It is used for healing the session.
     * For example: if your session is marked bad two times, but it is successful on the third attempt it's errorScore is decremented by this number.
     * @param options.createdAt {Date} - Date of creation.
     * @param options.expiredAt {Date} - Date of expiration.
     * @param [options.usageCount=0] {Number} - Indicates how many times the session has been used.
     * @param [options.errorCount=0] {Number} - Indicates how many times the session is marked bad.
     * @param [options.maxUsageCount=50] {Number} - Session should be used only a limited amount of times.
     * This number indicates how many times the session is going to be used, before it is thrown away.
     * @param options.sessionPool {EventEmitter} - SessionPool instance. Session will emit the `sessionRetired` event on this instance.
     */
    constructor(options?: {});
    id: any;
    cookies: any;
    cookieJar: any;
    maxAgeSecs: any;
    userData: any;
    maxErrorScore: any;
    errorScoreDecrement: any;
    expiresAt: any;
    createdAt: any;
    usageCount: any;
    errorScore: any;
    maxUsageCount: any;
    sessionPool: any;
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
     * @return {Object} represents session internal state.
     */
    getState(): any;
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
     * Retires session based on status code.
     * @param statusCode {Number} - HTTP status code
     * @return {boolean} whether the session was retired.
     */
    checkStatus(statusCode: number): boolean;
    /**
     * Sets cookies from response to the cookieJar.
     * Parses cookies from `set-cookie` header and sets them to `Session.cookieJar`.
     * @param response
     */
    setCookiesFromResponse(response: any): void;
    /**
     * Set cookies to session cookieJar.
     * Cookies array should be [puppeteer](https://pptr.dev/#?product=Puppeteer&version=v2.0.0&show=api-pagecookiesurls) cookie compatible.
     * @param cookies {Array<Object>}
     * @param url {String}
     */
    setPuppeteerCookies(cookies: any[], url: string): void;
    /**
     * Gets cookies in puppeteer ready to be used with `page.setCookie`.
     * @param url {String} - website url. Only cookies stored for this url will be returned
     * @return {Array<Object>}
     */
    getPuppeteerCookies(url: string): any[];
    /**
     * Wrapper around `tough-cookie` Cookie jar `getCookieString` method.
     * @param url
     * @return {String} - represents `Cookie` header.
     */
    getCookieString(url: any): string;
    /**
     *  Transforms puppeteer cookie to tough-cookie.
     * @param puppeteerCookie {Object} - Cookie from puppeteer `page.cookies method.
     * @return {Cookie}
     * @private
     */
    _puppeteerCookieToTough(puppeteerCookie: any): typeof tough.Cookie;
    /**
     *  Transforms tough-cookie cookie to puppeteer Cookie .
     * @param toughCookie - Cookie from CookieJar.
     * @return {Object} - puppeteer cookie
     * @private
     */
    _toughCookieToPuppeteer(toughCookie: any): any;
    /**
     * Sets cookies.
     * @param cookies
     * @param url
     * @private
     */
    _setCookies(cookies: any, url: any): void;
}
import tough from "tough-cookie";
