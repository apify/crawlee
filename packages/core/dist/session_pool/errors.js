"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CookieParseError = void 0;
/**
 * @ignore
 */
class CookieParseError extends Error {
    constructor(cookieHeaderString) {
        super(`Could not parse cookie header string: ${cookieHeaderString}`);
        Object.defineProperty(this, "cookieHeaderString", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: cookieHeaderString
        });
        Error.captureStackTrace(this, CookieParseError);
    }
}
exports.CookieParseError = CookieParseError;
//# sourceMappingURL=errors.js.map