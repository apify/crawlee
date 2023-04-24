/// <reference types="node" />
import type { Log } from '@apify/log';
import type { BrowserLikeResponse, Cookie as CookieObject, Dictionary } from '@crawlee/types';
import type { IncomingMessage } from 'node:http';
import type { Cookie } from 'tough-cookie';
import { CookieJar } from 'tough-cookie';
/**
 * Persistable {@apilink Session} state.
 */
export interface SessionState {
    id: string;
    cookieJar: CookieJar.Serialized;
    userData: object;
    errorScore: number;
    maxErrorScore: number;
    errorScoreDecrement: number;
    usageCount: number;
    maxUsageCount: number;
    expiresAt: string;
    createdAt: string;
}
export interface SessionOptions {
    /** Id of session used for generating fingerprints. It is used as proxy session name. */
    id?: string;
    /**
     * Number of seconds after which the session is considered as expired.
     * @default 3000
     */
    maxAgeSecs?: number;
    /** Object where custom user data can be stored. For example custom headers. */
    userData?: Dictionary;
    /**
     * Maximum number of marking session as blocked usage.
     * If the `errorScore` reaches the `maxErrorScore` session is marked as block and it is thrown away.
     * It starts at 0. Calling the `markBad` function increases the `errorScore` by 1.
     * Calling the `markGood` will decrease the `errorScore` by `errorScoreDecrement`
     * @default 3
     */
    maxErrorScore?: number;
    /**
     * It is used for healing the session.
     * For example: if your session is marked bad two times, but it is successful on the third attempt it's errorScore
     * is decremented by this number.
     * @default 0.5
     */
    errorScoreDecrement?: number;
    /** Date of creation. */
    createdAt?: Date;
    /** Date of expiration. */
    expiresAt?: Date;
    /**
     * Indicates how many times the session has been used.
     * @default 0
     */
    usageCount?: number;
    /**
     * Session should be used only a limited amount of times.
     * This number indicates how many times the session is going to be used, before it is thrown away.
     * @default 50
     */
    maxUsageCount?: number;
    /** SessionPool instance. Session will emit the `sessionRetired` event on this instance. */
    sessionPool?: import('./session_pool').SessionPool;
    log?: Log;
    errorScore?: number;
    cookieJar?: CookieJar;
}
/**
 * Sessions are used to store information such as cookies and can be used for generating fingerprints and proxy sessions.
 * You can imagine each session as a specific user, with its own cookies, IP (via proxy) and potentially a unique browser fingerprint.
 * Session internal state can be enriched with custom user data for example some authorization tokens and specific headers in general.
 * @category Scaling
 */
export declare class Session {
    readonly id: string;
    private maxAgeSecs;
    userData: Dictionary;
    private maxErrorScore;
    private errorScoreDecrement;
    private createdAt;
    private expiresAt;
    private usageCount;
    private maxUsageCount;
    private sessionPool;
    private errorScore;
    private cookieJar;
    private log;
    /**
     * Session configuration.
     */
    constructor(options: SessionOptions);
    /**
     * Indicates whether the session is blocked.
     * Session is blocked once it reaches the `maxErrorScore`.
     */
    isBlocked(): boolean;
    /**
     * Indicates whether the session is expired.
     * Session expiration is determined by the `maxAgeSecs`.
     * Once the session is older than `createdAt + maxAgeSecs` the session is considered expired.
     */
    isExpired(): boolean;
    /**
     * Indicates whether the session is used maximum number of times.
     * Session maximum usage count can be changed by `maxUsageCount` parameter.
     */
    isMaxUsageCountReached(): boolean;
    /**
     * Indicates whether the session can be used for next requests.
     * Session is usable when it is not expired, not blocked and the maximum usage count has not be reached.
     */
    isUsable(): boolean;
    /**
     * This method should be called after a successful session usage.
     * It increases `usageCount` and potentially lowers the `errorScore` by the `errorScoreDecrement`.
     */
    markGood(): void;
    /**
     * Gets session state for persistence in KeyValueStore.
     * @returns Represents session internal state.
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
     * @param statusCode HTTP status code.
     * @returns Whether the session was retired.
     */
    retireOnBlockedStatusCodes(statusCode: number): boolean;
    /**
     * With certain status codes: `401`, `403` or `429` we can be certain
     * that the target website is blocking us. This function helps to do this conveniently
     * by retiring the session when such code is received. Optionally the default status
     * codes can be extended in the second parameter.
     * @param statusCode HTTP status code.
     * @param [additionalBlockedStatusCodes]
     *   Custom HTTP status codes that means blocking on particular website.
     *
     *   **This parameter is deprecated and will be removed in next major version.**
     * @returns Whether the session was retired.
     * @deprecated The parameter `additionalBlockedStatusCodes` is deprecated and will be removed in next major version.
     */
    retireOnBlockedStatusCodes(statusCode: number, additionalBlockedStatusCodes?: number[]): boolean;
    /**
     * Saves cookies from an HTTP response to be used with the session.
     * It expects an object with a `headers` property that's either an `Object`
     * (typical Node.js responses) or a `Function` (Puppeteer Response).
     *
     * It then parses and saves the cookies from the `set-cookie` header, if available.
     */
    setCookiesFromResponse(response: IncomingMessage | BrowserLikeResponse | {
        headers: Dictionary<string | string[]>;
        url: string;
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
     */
    setCookies(cookies: CookieObject[], url: string): void;
    /**
     * Returns cookies in a format compatible with puppeteer/playwright and ready to be used with `page.setCookie`.
     * @param url website url. Only cookies stored for this url will be returned
     */
    getCookies(url: string): CookieObject[];
    /**
     * Returns cookies saved with the session in the typical
     * key1=value1; key2=value2 format, ready to be used in
     * a cookie header or elsewhere.
     * @returns Represents `Cookie` header.
     */
    getCookieString(url: string): string;
    /**
     * Sets a cookie within this session for the specific URL.
     */
    setCookie(rawCookie: string, url: string): void;
    /**
     * Sets cookies.
     */
    protected _setCookies(cookies: Cookie[], url: string): void;
    /**
     * Checks if session is not usable. if it is not retires the session.
     */
    protected _maybeSelfRetire(): void;
}
//# sourceMappingURL=session.d.ts.map