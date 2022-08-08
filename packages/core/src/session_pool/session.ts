import type { Log } from '@apify/log';
import { cryptoRandomObjectId } from '@apify/utilities';
import type { BrowserLikeResponse, Cookie as CookieObject, Dictionary } from '@crawlee/types';
import type { IncomingMessage } from 'node:http';
import { EventEmitter } from 'node:events';
import ow from 'ow';
import type { Cookie } from 'tough-cookie';
import { CookieJar } from 'tough-cookie';
import { log as defaultLog } from '../log';
import { EVENT_SESSION_RETIRED } from './events';
import { browserPoolCookieToToughCookie, getCookiesFromResponse, getDefaultCookieExpirationDate, toughCookieToBrowserPoolCookie } from '../cookie_utils';

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
export class Session {
    readonly id: string;
    private maxAgeSecs: number;
    userData: Dictionary;
    private maxErrorScore: number;
    private errorScoreDecrement: number;
    private createdAt: Date;
    private expiresAt: Date;
    private usageCount: number;
    private maxUsageCount: number;
    private sessionPool: import('./session_pool').SessionPool;
    private errorScore: number;
    private cookieJar: CookieJar;
    private log: Log;

    /**
     * Session configuration.
     */
    constructor(options: SessionOptions) {
        ow(options, ow.object.exactShape({
            sessionPool: ow.object.instanceOf(EventEmitter),
            id: ow.optional.string,
            cookieJar: ow.optional.object,
            maxAgeSecs: ow.optional.number,
            userData: ow.optional.object,
            maxErrorScore: ow.optional.number,
            errorScoreDecrement: ow.optional.number,
            createdAt: ow.optional.date,
            expiresAt: ow.optional.date,
            usageCount: ow.optional.number,
            errorScore: ow.optional.number,
            maxUsageCount: ow.optional.number,
            log: ow.optional.object,
        }));

        const {
            sessionPool,
            id = `session_${cryptoRandomObjectId(10)}`,
            cookieJar = new CookieJar(),
            maxAgeSecs = 3000,
            userData = {},
            maxErrorScore = 3,
            errorScoreDecrement = 0.5,
            createdAt = new Date(),
            usageCount = 0,
            errorScore = 0,
            maxUsageCount = 50,
            log = defaultLog,
        } = options;

        const { expiresAt = getDefaultCookieExpirationDate(maxAgeSecs) } = options;

        this.log = log.child({ prefix: 'Session' });

        this.cookieJar = cookieJar.setCookie as unknown ? cookieJar : CookieJar.fromJSON(JSON.stringify(cookieJar));
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
    }

    /**
     * Indicates whether the session is blocked.
     * Session is blocked once it reaches the `maxErrorScore`.
     */
    isBlocked(): boolean {
        return this.errorScore >= this.maxErrorScore;
    }

    /**
     * Indicates whether the session is expired.
     * Session expiration is determined by the `maxAgeSecs`.
     * Once the session is older than `createdAt + maxAgeSecs` the session is considered expired.
     */
    isExpired(): boolean {
        return this.expiresAt <= new Date();
    }

    /**
     * Indicates whether the session is used maximum number of times.
     * Session maximum usage count can be changed by `maxUsageCount` parameter.
     */
    isMaxUsageCountReached(): boolean {
        return this.usageCount >= this.maxUsageCount;
    }

    /**
     * Indicates whether the session can be used for next requests.
     * Session is usable when it is not expired, not blocked and the maximum usage count has not be reached.
     */
    isUsable(): boolean {
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

        this._maybeSelfRetire();
    }

    /**
     * Gets session state for persistence in KeyValueStore.
     * @returns Represents session internal state.
     */
    getState(): SessionState {
        return {
            id: this.id,
            cookieJar: this.cookieJar.toJSON(),
            userData: this.userData,
            maxErrorScore: this.maxErrorScore,
            errorScoreDecrement: this.errorScoreDecrement,
            expiresAt: this.expiresAt.toISOString(),
            createdAt: this.createdAt.toISOString(),
            usageCount: this.usageCount,
            maxUsageCount: this.maxUsageCount,
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
        this.sessionPool.emit(EVENT_SESSION_RETIRED, this);
    }

    /**
     * Increases usage and error count.
     * Should be used when the session has been used unsuccessfully. For example because of timeouts.
     */
    markBad() {
        this.errorScore += 1;
        this.usageCount += 1;

        this._maybeSelfRetire();
    }

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

    retireOnBlockedStatusCodes(statusCode: number, additionalBlockedStatusCodes: number[] = []): boolean {
        // @ts-expect-error
        const isBlocked = this.sessionPool.blockedStatusCodes.concat(additionalBlockedStatusCodes).includes(statusCode);
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
     */
    setCookiesFromResponse(response: IncomingMessage | BrowserLikeResponse | { headers: Dictionary<string | string[]>; url: string }) {
        try {
            const cookies = getCookiesFromResponse(response).filter((c) => c);
            this._setCookies(cookies, typeof response.url === 'function' ? response.url() : response.url!);
        } catch (e) {
            const err = e as Error;
            // if invalid Cookie header is provided just log the exception.
            this.log.exception(err, 'Could not get cookies from response');
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
     */
    setCookies(cookies: CookieObject[], url: string) {
        const normalizedCookies = cookies.map((c) => browserPoolCookieToToughCookie(c, this.maxAgeSecs));
        this._setCookies(normalizedCookies, url);
    }

    /**
     * Returns cookies in a format compatible with puppeteer/playwright and ready to be used with `page.setCookie`.
     * @param url website url. Only cookies stored for this url will be returned
     */
    getCookies(url: string): CookieObject[] {
        const cookies = this.cookieJar.getCookiesSync(url);
        return cookies.map((c) => toughCookieToBrowserPoolCookie(c));
    }

    /**
     * Returns cookies saved with the session in the typical
     * key1=value1; key2=value2 format, ready to be used in
     * a cookie header or elsewhere.
     * @returns Represents `Cookie` header.
     */
    getCookieString(url: string): string {
        return this.cookieJar.getCookieStringSync(url, {});
    }

    /**
     * Sets a cookie within this session for the specific URL.
     */
    setCookie(rawCookie: string, url: string): void {
        this.cookieJar.setCookieSync(rawCookie, url);
    }

    /**
     * Sets cookies.
     */
    protected _setCookies(cookies: Cookie[], url: string): void {
        const errorMessages: string[] = [];

        for (const cookie of cookies) {
            try {
                this.cookieJar.setCookieSync(cookie, url, { ignoreError: false });
            } catch (e) {
                const err = e as Error;
                errorMessages.push(err.message);
            }
        }

        // if invalid cookies are provided just log the exception. No need to retry the request automatically.
        if (errorMessages.length) {
            this.log.debug('Could not set cookies.', { errorMessages });
        }
    }

    /**
     * Checks if session is not usable. if it is not retires the session.
     */
    protected _maybeSelfRetire(): void {
        if (!this.isUsable()) {
            this.retire();
        }
    }
}
