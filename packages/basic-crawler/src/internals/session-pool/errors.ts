/**
 * @ignore
 */
export class CookieParseError extends Error {
    constructor(readonly cookieHeaderString: unknown) {
        super(`Could not parse cookie header string: ${cookieHeaderString}`);
        Error.captureStackTrace(this, CookieParseError);
    }
}
