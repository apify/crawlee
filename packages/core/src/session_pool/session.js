import { CookieJar } from 'tough-cookie';
import { z } from 'zod';
import { cryptoRandomObjectId } from '@apify/utilities';
import { getDefaultCookieExpirationDate } from '../cookie_utils.js';
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
/**
 * Sessions are used to store information such as cookies and can be used for generating fingerprints and proxy sessions.
 * You can imagine each session as a specific user, with its own cookies, IP (via proxy) and potentially a unique browser fingerprint.
 * Session internal state can be enriched with custom user data for example some authorization tokens and specific headers in general.
 * @category Scaling
 */
export class Session {
    id;
    userData;
    #maxErrorScore;
    #errorScoreDecrement;
    #createdAt;
    #expiresAt;
    #usageCount;
    #maxUsageCount;
    #errorScore;
    #retired = false;
    #proxyInfo;
    #cookieJar;
    #fingerprint;
    #log;
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
    get fingerprint() {
        return this.#fingerprint;
    }
    set fingerprint(fingerprint) {
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
    constructor(options = {}) {
        const { id, cookieJar, proxyInfo, maxAgeSecs, userData, maxErrorScore, errorScoreDecrement, createdAt, usageCount, errorScore, maxUsageCount, retired, log, fingerprint, expiresAt = getDefaultCookieExpirationDate(maxAgeSecs), } = parseArgument(options, sessionOptionsSchema);
        this.#log = log.child({ prefix: 'Session' });
        this.#cookieJar = cookieJar.setCookie ? cookieJar : CookieJar.fromJSON(JSON.stringify(cookieJar));
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
    isBlocked() {
        return this.errorScore >= this.maxErrorScore;
    }
    /**
     * Indicates whether the session is expired.
     * Session expiration is determined by the `maxAgeSecs`.
     * Once the session is older than `createdAt + maxAgeSecs` the session is considered expired.
     */
    isExpired() {
        return this.expiresAt <= new Date();
    }
    /**
     * Indicates whether the session is used maximum number of times.
     * Session maximum usage count can be changed by `maxUsageCount` parameter.
     */
    isMaxUsageCountReached() {
        return this.usageCount >= this.maxUsageCount;
    }
    /**
     * Indicates whether the session can be used for next requests.
     * Session is usable when it is not retired, not expired, not blocked and the maximum usage count has not be reached.
     */
    isUsable() {
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
    getState() {
        return {
            id: this.id,
            cookieJar: this.cookieJar.toJSON(),
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
        if (this.#retired)
            return;
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
    async getCookieString(url) {
        return this.cookieJar.getCookieString(url, {});
    }
    /**
     * Sets a cookie within this session for the specific URL.
     */
    async setCookie(rawCookie, url) {
        try {
            await this.cookieJar.setCookie(rawCookie, url);
        }
        catch (e) {
            this.#log.warning('Could not set cookie.', { url, error: e.message });
        }
    }
    /**
     * Checks if session is not usable. if it is not retires the session.
     */
    maybeSelfRetire() {
        if (!this.isUsable()) {
            this.retire();
        }
    }
}
