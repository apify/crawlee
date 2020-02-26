export class CookieParseError extends Error {
    /**
     * @param {string} cookieHeaderString
     */
    constructor(cookieHeaderString: string);
    cookieHeaderString: string;
}
