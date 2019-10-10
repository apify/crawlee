import { checkParamPrototypeOrThrow, cryptoRandomObjectId } from 'apify-shared/utilities';
import moment from 'moment';

import EVENTS from './events';


// TODO: Validation
export default class Session {
    constructor(
        {
            id = cryptoRandomObjectId(),
            cookies = [],
            fingerprintSeed = cryptoRandomObjectId(),
            maxAgeSecs = 3000,
            userData = {},
            maxErrorScore = 3,
            errorScoreDecrement = 0.5,
            expiresAt = moment().add(3000, 'seconds').toISOString(),
            createdAt = moment().toISOString(),
            usageCount = 0,
            errorScore = 0,
            maxSessionUsageCount = 50,
            sessionPool,

        },
    ) {
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

    isBlocked() {
        return this.errorScore >= this.maxErrorScore;
    }

    isExpired() {
        const now = moment();

        return moment(this.expiresAt).isSameOrAfter(now);
    }

    isUsable() {
        return !(this.isBlocked() && this.isExpired() && this.isMaxUseCountReached());
    }

    isMaxUseCountReached() {
        return this.usageCount >= this.maxSessionUsageCount;
    }

    reclaim() {
        this.usageCount += 1;

        // I should probably lower the errorScore
        this.errorScore -= this.errorScoreDecrement;
    }

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
     * Marks session as blocked
     */
    retire() {
        // mark it as an invalid by increasing the error score count.
        this.errorScore += this.maxErrorScore;
        this.usageCount += 1;

        // emit event so we can retire browser in puppeteer pool
        this.sessionPool.emit(EVENTS.DISCARDED, this);
    }

    /**
     * Increases  and usage error count
     * Should be used unsuccessful request/use with the session
     */
    fail() {
        this.errorScore += 1;
        this.usageCount += 1;
    }
}
