"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Session = void 0;
const tslib_1 = require("tslib");
const utilities_1 = require("@apify/utilities");
const node_events_1 = require("node:events");
const ow_1 = tslib_1.__importDefault(require("ow"));
const tough_cookie_1 = require("tough-cookie");
const log_1 = require("../log");
const events_1 = require("./events");
const cookie_utils_1 = require("../cookie_utils");
/**
 * Sessions are used to store information such as cookies and can be used for generating fingerprints and proxy sessions.
 * You can imagine each session as a specific user, with its own cookies, IP (via proxy) and potentially a unique browser fingerprint.
 * Session internal state can be enriched with custom user data for example some authorization tokens and specific headers in general.
 * @category Scaling
 */
class Session {
    /**
     * Session configuration.
     */
    constructor(options) {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxAgeSecs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "userData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxErrorScore", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "errorScoreDecrement", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "createdAt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "expiresAt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "usageCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxUsageCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sessionPool", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "errorScore", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cookieJar", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "log", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        (0, ow_1.default)(options, ow_1.default.object.exactShape({
            sessionPool: ow_1.default.object.instanceOf(node_events_1.EventEmitter),
            id: ow_1.default.optional.string,
            cookieJar: ow_1.default.optional.object,
            maxAgeSecs: ow_1.default.optional.number,
            userData: ow_1.default.optional.object,
            maxErrorScore: ow_1.default.optional.number,
            errorScoreDecrement: ow_1.default.optional.number,
            createdAt: ow_1.default.optional.date,
            expiresAt: ow_1.default.optional.date,
            usageCount: ow_1.default.optional.number,
            errorScore: ow_1.default.optional.number,
            maxUsageCount: ow_1.default.optional.number,
            log: ow_1.default.optional.object,
        }));
        const { sessionPool, id = `session_${(0, utilities_1.cryptoRandomObjectId)(10)}`, cookieJar = new tough_cookie_1.CookieJar(), maxAgeSecs = 3000, userData = {}, maxErrorScore = 3, errorScoreDecrement = 0.5, createdAt = new Date(), usageCount = 0, errorScore = 0, maxUsageCount = 50, log = log_1.log, } = options;
        const { expiresAt = (0, cookie_utils_1.getDefaultCookieExpirationDate)(maxAgeSecs) } = options;
        this.log = log.child({ prefix: 'Session' });
        this.cookieJar = cookieJar.setCookie ? cookieJar : tough_cookie_1.CookieJar.fromJSON(JSON.stringify(cookieJar));
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
     * Session is usable when it is not expired, not blocked and the maximum usage count has not be reached.
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
        this._maybeSelfRetire();
    }
    /**
     * Gets session state for persistence in KeyValueStore.
     * @returns Represents session internal state.
     */
    getState() {
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
        this.sessionPool.emit(events_1.EVENT_SESSION_RETIRED, this);
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
    retireOnBlockedStatusCodes(statusCode, additionalBlockedStatusCodes = []) {
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
    setCookiesFromResponse(response) {
        try {
            const cookies = (0, cookie_utils_1.getCookiesFromResponse)(response).filter((c) => c);
            this._setCookies(cookies, typeof response.url === 'function' ? response.url() : response.url);
        }
        catch (e) {
            const err = e;
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
    setCookies(cookies, url) {
        const normalizedCookies = cookies.map((c) => (0, cookie_utils_1.browserPoolCookieToToughCookie)(c, this.maxAgeSecs));
        this._setCookies(normalizedCookies, url);
    }
    /**
     * Returns cookies in a format compatible with puppeteer/playwright and ready to be used with `page.setCookie`.
     * @param url website url. Only cookies stored for this url will be returned
     */
    getCookies(url) {
        const cookies = this.cookieJar.getCookiesSync(url);
        return cookies.map((c) => (0, cookie_utils_1.toughCookieToBrowserPoolCookie)(c));
    }
    /**
     * Returns cookies saved with the session in the typical
     * key1=value1; key2=value2 format, ready to be used in
     * a cookie header or elsewhere.
     * @returns Represents `Cookie` header.
     */
    getCookieString(url) {
        return this.cookieJar.getCookieStringSync(url, {});
    }
    /**
     * Sets a cookie within this session for the specific URL.
     */
    setCookie(rawCookie, url) {
        this.cookieJar.setCookieSync(rawCookie, url);
    }
    /**
     * Sets cookies.
     */
    _setCookies(cookies, url) {
        const errorMessages = [];
        for (const cookie of cookies) {
            try {
                this.cookieJar.setCookieSync(cookie, url, { ignoreError: false });
            }
            catch (e) {
                const err = e;
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
    _maybeSelfRetire() {
        if (!this.isUsable()) {
            this.retire();
        }
    }
}
exports.Session = Session;
//# sourceMappingURL=session.js.map