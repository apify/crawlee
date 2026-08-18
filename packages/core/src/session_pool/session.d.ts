import type { Dictionary, ISession, ProxyInfo, SessionFingerprint, SessionState } from '@crawlee/types';
import { CookieJar } from 'tough-cookie';
import type { CrawleeLogger } from '../log.js';
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
    /**
     * Marks the session as already retired. Used when restoring a previously persisted session
     * so that `isUsable()` reflects the terminal state regardless of error score or usage count.
     * @default false
     */
    retired?: boolean;
    log?: CrawleeLogger;
    errorScore?: number;
    cookieJar?: CookieJar;
    proxyInfo?: ProxyInfo;
    /**
     * Browser / HTTP client fingerprint tied to this session. Backends use this to make
     * repeated requests with the same session look consistent (same user-agent, headers,
     * TLS profile). See {@apilink SessionFingerprint}.
     */
    fingerprint?: SessionFingerprint;
}
/**
 * Sessions are used to store information such as cookies and can be used for generating fingerprints and proxy sessions.
 * You can imagine each session as a specific user, with its own cookies, IP (via proxy) and potentially a unique browser fingerprint.
 * Session internal state can be enriched with custom user data for example some authorization tokens and specific headers in general.
 * @category Scaling
 */
export declare class Session implements ISession {
    #private;
    readonly id: string;
    readonly userData: Dictionary;
    get errorScore(): number;
    get usageCount(): number;
    get maxErrorScore(): number;
    get errorScoreDecrement(): number;
    get expiresAt(): Date;
    get createdAt(): Date;
    get maxUsageCount(): number;
    get cookieJar(): CookieJar;
    get proxyInfo(): ProxyInfo | undefined;
    get fingerprint(): SessionFingerprint | undefined;
    set fingerprint(fingerprint: SessionFingerprint | undefined);
    /**
     * `true` once {@apilink Session.retire|`retire()`} has been called. Retirement is terminal:
     * a retired session is never picked by the pool and cannot be revived via `markGood()`.
     */
    get retired(): boolean;
    /**
     * Session configuration.
     */
    constructor(options?: SessionOptions);
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
     * Session is usable when it is not retired, not expired, not blocked and the maximum usage count has not be reached.
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
     * Permanently retires the session — `isUsable()` will return `false` from here on,
     * and no `markGood()` / `markBad()` can revive it. Calling `retire()` again is a no-op.
     *
     * Use this when you're confident the session itself is the problem (e.g. a `403` response).
     * For transient external failures (such as `5XX` responses), use `markBad()` instead.
     */
    retire(): void;
    /**
     * Increases usage and error count.
     * Should be used when the session has been used unsuccessfully. For example because of timeouts.
     */
    markBad(): void;
    /**
     * Returns cookies saved with the session in the typical
     * key1=value1; key2=value2 format, ready to be used in
     * a cookie header or elsewhere.
     * @returns Represents `Cookie` header.
     */
    getCookieString(url: string): Promise<string>;
    /**
     * Sets a cookie within this session for the specific URL.
     */
    setCookie(rawCookie: string, url: string): Promise<void>;
    /**
     * Checks if session is not usable. if it is not retires the session.
     */
    private maybeSelfRetire;
}
