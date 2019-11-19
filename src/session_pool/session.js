import { cryptoRandomObjectId } from 'apify-shared/utilities';

import { checkParamOrThrow } from 'apify-client/build/utils';
import EVENTS from './events';


/**
 *  Class aggregating data for session.
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
    constructor(options = {}) {
        const {
            id = `session_${cryptoRandomObjectId(10)}`,
            cookies = [],
            maxAgeSecs = 3000,
            userData = {},
            maxErrorScore = 3,
            errorScoreDecrement = 0.5,
            createdAt = new Date(),
            usageCount = 0,
            errorScore = 0,
            maxUsageCount = 50,
            sessionPool,
        } = options;

        const { expiresAt = new Date(Date.now() + (maxAgeSecs * 1000)) } = options;

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
            throw new Error('Session: sessionPool must be instance of SessionPool');
        }

        // Configurable
        this.id = id;
        this.cookies = cookies;
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
     * @return {Object} represents session internal state.
     */
    getState() {
        return {
            id: this.id,
            cookies: this.cookies,
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
}
