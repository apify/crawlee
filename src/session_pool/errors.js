export class CookieParseError extends Error {
    /**
     * @param {string} cookieHeaderString
     */
    constructor(cookieHeaderString) {
        super(`Could not parse cookie header string: ${cookieHeaderString}`);
        this.cookieHeaderString = cookieHeaderString;

        Error.captureStackTrace(this, CookieParseError);
    }
}
