import EventEmitter from 'events';

import { cryptoRandomObjectId } from 'apify-shared/utilities';
import moment from 'moment';

import { checkParamOrThrow } from 'apify-client/build/utils';
import EVENTS from './events';


/**
 *  Class aggregating data for `Session`.
 *  Session internal state can be enriched with custom user data for example some authorization tokens.
 */
export default class Session {
    constructor(options = {}) {
        const {
            id = cryptoRandomObjectId(),
            cookies = [],
            fingerprintSeed = cryptoRandomObjectId(),
            maxAgeSecs = 3000,
            userData = {},
            maxErrorScore = 3,
            errorScoreDecrement = 0.5,
            createdAt = moment().toISOString(),
            usageCount = 0,
            errorScore = 0,
            maxSessionUsageCount = 50,
            sessionPool,
        } = options;

        let { expiresAt } = options;

        // Validation
        checkParamOrThrow(id, 'options.id', 'Maybe String');
        checkParamOrThrow(cookies, 'options.cookies', 'Maybe Array');
        checkParamOrThrow(fingerprintSeed, 'options.fingerprintSeed', 'Maybe String');
        checkParamOrThrow(maxAgeSecs, 'options.maxAgeSecs', 'Maybe Number');
        checkParamOrThrow(userData, 'options.userData', 'Maybe Object');
        checkParamOrThrow(maxErrorScore, 'options.maxErrorScore', 'Maybe Number');
        checkParamOrThrow(expiresAt, 'options.expiresAt', 'Maybe String');
        checkParamOrThrow(createdAt, 'options.createdAt', 'Maybe String');
        checkParamOrThrow(usageCount, 'options.usageCount', 'Maybe Number');
        checkParamOrThrow(errorScore, 'options.errorScore', 'Maybe Number');
        checkParamOrThrow(maxSessionUsageCount, 'options.maxSessionUsageCount', 'Maybe Number');
        checkParamOrThrow(sessionPool, 'options.sessionPool', 'Object');

        // sessionPool must be at least instance of EvenEmitter.
        // That way we can allow custom implementation of SessionPool in the future (It should not be needed).
        if (!(sessionPool instanceof EventEmitter)) {
            throw new Error('Session: sessionPool must be instance of SessionPool');
        }

        if (!expiresAt) {
            expiresAt = moment().add(maxAgeSecs, 'seconds').toISOString();
        }

        // Configurable
        this.id = id;
        this.cookies = cookies;
        this.fingerprintSeed = fingerprintSeed;
        this.maxAgeSecs = maxAgeSecs;
        this.userData = userData;
        this.maxErrorScore = maxErrorScore;
        this.errorScoreDecrement = errorScoreDecrement; // TODO: Better Naming

        // Internal
        this.expiresAt = expiresAt;
        this.createdAt = createdAt;
        this.usageCount = usageCount;
        this.errorScore = errorScore;
        this.maxSessionUsageCount = maxSessionUsageCount;
        this.sessionPool = sessionPool;
    }

    /**
     * Decides whether the `Session` is blocked.
     * `Session` is blocked once it reached the maximum error count.
     * @return {boolean}
     */
    isBlocked() {
        return this.errorScore >= this.maxErrorScore;
    }

    /**
     * Decides whether the `Session` is expired.
     * @return {boolean}
     */
    isExpired() {
        const now = moment();

        return moment(this.expiresAt).isSameOrBefore(now);
    }

    /**
     * Decides whether the `Session` is used maximum number of times.
     * @return {boolean}
     */
    isMaxUseCountReached() {
        return this.usageCount >= this.maxSessionUsageCount;
    }

    /**
     * Decides whether the `Session` can be used for next requests.
     * @return {boolean}
     */
    isUsable() {
        return !this.isBlocked() && !this.isExpired() && !this.isMaxUseCountReached();
    }

    /**
     * Marks the `Session` after successful request.
     * Increases usage count and if the `Session` had failed in the previous requests it lowers the errorScore to 'heel' itself.
     */
    reclaim() {
        this.usageCount += 1;

        // We should probably lower the errorScore.
        if (this.errorScore > 0) {
            this.errorScore -= this.errorScoreDecrement;
        }
    }

    /**
     * Gets `Session` state for persistence in KeyValueStore.
     * @return {{
     * createdAt: string | *,
     * userData: {},
     * errorScoreDecrement: number,
     * maxErrorScore: number,
     * id: String,
     * cookies: ([]|Array),
     * expiresAt: string | *,
     * usageCount: number,
     * errorScore: number
     * }}
     */
    getState() {
        return {
            id: this.id,
            cookies: this.cookies,
            userData: this.userData,
            maxErrorScore: this.maxErrorScore,
            errorScoreDecrement: this.errorScoreDecrement,
            expiresAt: this.expiresAt,
            createdAt: this.createdAt,
            usageCount: this.usageCount,
            errorScore: this.errorScore,
        };
    }

    /**
     * Marks session as blocked and emits event on the `SessionPool`
     */
    retire() {
        // mark it as an invalid by increasing the error score count.
        this.errorScore += this.maxErrorScore;
        this.usageCount += 1;

        // emit event so we can retire browser in puppeteer pool
        this.sessionPool.emit(EVENTS.DISCARDED, this);
    }

    /**
     * Increases usage and error count
     * Should be used unsuccessful request/use with the session
     */
    fail() {
        this.errorScore += 1;
        this.usageCount += 1;
    }
}
