import type { Dictionary, ISession, ProxyInfo, SessionFingerprint, SessionState } from '@crawlee/types';
import { CookieJar } from 'tough-cookie';
import { z } from 'zod';

import { cryptoRandomObjectId } from '@apify/utilities';

import type { CrawleeLogger } from '../log.js';
import { serviceLocator } from '../service_locator.js';
import { parseArgument, schemas, validators } from '../validators.js';

// `schemas.anyObject` passes values through by reference (object schemas return a pruned plain
// copy), so class instances like cookie jars and loggers keep their prototype.
const sessionOptionsSchema = z.strictObject({
    id: z.string().default(() => `session_${cryptoRandomObjectId(10)}`),
    cookieJar: schemas.anyObject.default(() => new CookieJar()),
    proxyInfo: schemas.anyObject.optional(),
    maxAgeSecs: schemas.anyNumber.default(3000),
    userData: schemas.anyObject.default(() => ({})),
    maxErrorScore: schemas.anyNumber.default(3),
    errorScoreDecrement: schemas.anyNumber.default(0.5),
    createdAt: z.date().default(() => new Date()),
    expiresAt: z.date().optional(),
    usageCount: schemas.anyNumber.default(0),
    errorScore: schemas.anyNumber.default(0),
    maxUsageCount: schemas.anyNumber.default(50),
    retired: z.boolean().default(false),
    log: validators.logger.default(() => serviceLocator.getLogger()),
    fingerprint: schemas.anyObject.optional(),
});

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

    /**
     * Date of expiration.
     * @default createdAt + maxAgeSecs
     */
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
export class Session implements ISession {
    readonly id: string;
    readonly userData: Dictionary;
    #maxErrorScore: number;
    #errorScoreDecrement: number;
    #createdAt: Date;
    #expiresAt: Date;
    #usageCount: number;
    #maxUsageCount: number;
    #errorScore: number;
    #retired = false;
    #proxyInfo?: ProxyInfo;
    #cookieJar: CookieJar;
    #fingerprint?: SessionFingerprint;
    #log: CrawleeLogger;

    get errorScore() {
        return this.#errorScore;
    }

    get usageCount() {
        return this.#usageCount;
    }

    get maxErrorScore() {
        return this.#maxErrorScore;
    }

    get errorScoreDecrement() {
        return this.#errorScoreDecrement;
    }

    get expiresAt() {
        return this.#expiresAt;
    }

    get createdAt() {
        return this.#createdAt;
    }

    get maxUsageCount() {
        return this.#maxUsageCount;
    }

    get cookieJar() {
        return this.#cookieJar;
    }

    get proxyInfo() {
        return this.#proxyInfo;
    }

    get fingerprint(): SessionFingerprint | undefined {
        return this.#fingerprint;
    }

    set fingerprint(fingerprint: SessionFingerprint | undefined) {
        this.#fingerprint = fingerprint;
    }

    /**
     * `true` once {@apilink Session.retire|`retire()`} has been called. Retirement is terminal:
     * a retired session is never picked by the pool and cannot be revived via `markGood()`.
     */
    get retired() {
        return this.#retired;
    }

    /**
     * Session configuration.
     */
    constructor(options: SessionOptions = {}) {
        const {
            id,
            cookieJar,
            proxyInfo,
            maxAgeSecs,
            userData,
            maxErrorScore,
            errorScoreDecrement,
            createdAt,
            usageCount,
            errorScore,
            maxUsageCount,
            retired,
            log,
            fingerprint,
            // Anchored to `createdAt` rather than to "now", so the documented `createdAt + maxAgeSecs` holds.
            expiresAt = new Date(createdAt.getTime() + maxAgeSecs * 1000),
        } = parseArgument(options, sessionOptionsSchema);

        this.#log = log.child({ prefix: 'Session' });

        this.#cookieJar = (cookieJar.setCookie as unknown) ? cookieJar : CookieJar.fromJSON(JSON.stringify(cookieJar));
        this.#proxyInfo = proxyInfo;
        this.#fingerprint = fingerprint;
        this.id = id;
        this.userData = userData;
        this.#maxErrorScore = maxErrorScore;
        this.#errorScoreDecrement = errorScoreDecrement;

        // Internal
        this.#expiresAt = expiresAt;
        this.#createdAt = createdAt;
        this.#usageCount = usageCount; // indicates how many times the session has been used
        this.#errorScore = errorScore; // indicates number of markBaded request with the session
        this.#maxUsageCount = maxUsageCount;
        this.#retired = retired;
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
     * Session is usable when it is not retired, not expired, not blocked and the maximum usage count has not be reached.
     */
    isUsable(): boolean {
        return !this.#retired && !this.isBlocked() && !this.isExpired() && !this.isMaxUsageCountReached();
    }

    /**
     * This method should be called after a successful session usage.
     * It increases `usageCount` and potentially lowers the `errorScore` by the `errorScoreDecrement`.
     */
    markGood() {
        this.#usageCount += 1;

        if (this.#errorScore > 0) {
            this.#errorScore -= this.#errorScoreDecrement;
        }

        this.maybeSelfRetire();
    }

    /**
     * Gets session state for persistence in KeyValueStore.
     * @returns Represents session internal state.
     */
    getState(): SessionState {
        return {
            id: this.id,
            cookieJar: this.cookieJar.toJSON()!,
            proxyInfo: this.#proxyInfo,
            userData: this.userData,
            fingerprint: this.#fingerprint,
            maxErrorScore: this.maxErrorScore,
            errorScoreDecrement: this.errorScoreDecrement,
            expiresAt: this.expiresAt.toISOString(),
            createdAt: this.createdAt.toISOString(),
            usageCount: this.usageCount,
            maxUsageCount: this.maxUsageCount,
            errorScore: this.errorScore,
            retired: this.#retired,
        };
    }

    /**
     * Permanently retires the session — `isUsable()` will return `false` from here on,
     * and no `markGood()` / `markBad()` can revive it. Calling `retire()` again is a no-op.
     *
     * Use this when you're confident the session itself is the problem (e.g. a `403` response).
     * For transient external failures (such as `5XX` responses), use `markBad()` instead.
     */
    retire() {
        if (this.#retired) return;
        this.#errorScore += this.#maxErrorScore;
        this.#usageCount += 1;
        this.#retired = true;
    }

    /**
     * Increases usage and error count.
     * Should be used when the session has been used unsuccessfully. For example because of timeouts.
     */
    markBad() {
        this.#errorScore += 1;
        this.#usageCount += 1;

        this.maybeSelfRetire();
    }

    /**
     * Returns cookies saved with the session in the typical
     * key1=value1; key2=value2 format, ready to be used in
     * a cookie header or elsewhere.
     * @returns Represents `Cookie` header.
     */
    async getCookieString(url: string): Promise<string> {
        return this.cookieJar.getCookieString(url, {});
    }

    /**
     * Sets a cookie within this session for the specific URL.
     */
    async setCookie(rawCookie: string, url: string): Promise<void> {
        try {
            await this.cookieJar.setCookie(rawCookie, url);
        } catch (e) {
            this.#log.warning('Could not set cookie.', { url, error: (e as Error).message });
        }
    }

    /**
     * Checks if session is not usable. if it is not retires the session.
     */
    private maybeSelfRetire(): void {
        if (!this.isUsable()) {
            this.retire();
        }
    }
}
