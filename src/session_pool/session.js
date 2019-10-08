import { checkParamPrototypeOrThrow, cryptoRandomObjectId } from 'apify-shared/utilities';
import _ from 'underscore';
import moment from 'moment';

import EVENTS from './events';

export const SESSION_DEFAULT_OPTIONS = {
    name: cryptoRandomObjectId(),
    cookies: [],
    fingerPrintSeed: cryptoRandomObjectId(),
    maxAgeSecs: 3000,
    maxReuseCount: 50,
    userData: {},
    maxErrorScore: 3,
    errorScoreDecrement: 0.5,
    expiresAt: moment().add(3000, 'seconds').toISOString(),
    createdAt: moment().toISOString(),
    usedCount: 0,
    errorScore: 0,

};

// TODO: Validation
export default class Session {
    constructor(options) {
        const opts = _.defaults({}, options, SESSION_DEFAULT_OPTIONS);

        // Configurable
        this.name = opts.name;
        this.cookies = opts.cookies;
        this.fingerPrintSeed = opts.fingerPrintSeed;
        this.maxAgeSecs = opts.maxAgeSecs;
        this.userData = opts.userData;
        this.maxErrorScore = opts.maxErrorScore;
        this.errorScoreDecrement = opts.errorScoreDecrement; // TODO: Better Naming

        // Internal
        this.expiresAt = opts.expiresAt;
        this.createdAt = opts.createdAt;
        this.usedCount = opts.usedCount;
        this.errorScore = opts.errorScoreDecrement;
        this.sessionPool = opts.sessionPool;
    }

    static recreateSession(sessionObject) {
        return new Session(sessionObject);
    }

    isBlocked() {
        return this.errorScore >= this.maxErrorScore;
    }

    isExpired() {
        const now = moment();

        return moment(this.expiresAt).isSameOrAfter(now);
    }

    isUsable() {
        return !(this.isBlocked() && this.isExpired());
    }

    reclaim() {
        this.usedCount += 1;

        // I should probably lower the errorScore
        this.errorScore -= this.errorScoreDecrement;
    }

    getState() {
        return {
            name: this.name,
            cookies: this.cookies,
            userData: this.userData,
            maxErrorScore: this.maxErrorScore,
            errorScoreDecrement: this.errorScoreDecrement,
            expiresAt: this.expiresAt,
            createdAt: this.createdAt,
            usedCount: this.usedCount,
            errorScore: this.errorScore,
        };
    }


    retire(discard = false) {
        if (discard) {
            // mark it as an invalid by increasing the error score count.
            this.errorScore += this.maxErrorScore;

            // emit event so we can retire browser in puppeteer pool
            this.sessionPool.emit(EVENTS.DISCARD, this);
        } else {
            this.errorScore += 1;
        }

        this.usedCount += 1;
    }
}
