export namespace socialUtils {
    export { emailsFromText };
    export { emailsFromUrls };
    export { phonesFromText };
    export { phonesFromUrls };
    export { parseHandlesFromHtml };
    export { EMAIL_REGEX };
    export { EMAIL_REGEX_GLOBAL };
    export { LINKEDIN_REGEX };
    export { LINKEDIN_REGEX_GLOBAL };
    export { INSTAGRAM_REGEX };
    export { INSTAGRAM_REGEX_GLOBAL };
    export { TWITTER_REGEX };
    export { TWITTER_REGEX_GLOBAL };
    export { FACEBOOK_REGEX };
    export { FACEBOOK_REGEX_GLOBAL };
    export { YOUTUBE_REGEX };
    export { YOUTUBE_REGEX_GLOBAL };
}
/**
 * Representation of social handles parsed from a HTML page.
 *
 * The object has the following structure:
 *
 * ```
 * {
 *    emails: String[],
 *    phones: String[],
 *    phonesUncertain: String[],
 *    linkedIns: String[],
 *    twitters: String[],
 *    instagrams: String[],
 *    facebooks: String[],
 *    youtubes: String[],
 * }
 * ```
 */
export type SocialHandles = {
    emails: string[];
    phones: string[];
    phonesUncertain: string[];
    linkedIns: string[];
    twitters: string[];
    instagrams: string[];
    facebooks: string[];
    youtubes: string[];
};
declare function emailsFromText(text: string): string[];
declare function emailsFromUrls(urls: string[]): string[];
declare function phonesFromText(text: string): string[];
declare function phonesFromUrls(urls: string[]): string[];
declare function parseHandlesFromHtml(html: string, data?: Object): SocialHandles;
/**
 * Regular expression to exactly match a single email address.
 * It has the following form: `/^...$/i`.
 * @type {RegExp}
 * @memberOf social
 */
declare const EMAIL_REGEX: RegExp;
/**
 * Regular expression to find multiple email addresses in a text.
 * It has the following form: `/.../ig`.
 * @type {RegExp}
 * @memberOf social
 */
declare const EMAIL_REGEX_GLOBAL: RegExp;
/** @type RegExp */
declare let LINKEDIN_REGEX: RegExp;
/** @type RegExp */
declare let LINKEDIN_REGEX_GLOBAL: RegExp;
/** @type RegExp */
declare let INSTAGRAM_REGEX: RegExp;
/** @type RegExp */
declare let INSTAGRAM_REGEX_GLOBAL: RegExp;
/** @type RegExp */
declare let TWITTER_REGEX: RegExp;
/** @type RegExp */
declare let TWITTER_REGEX_GLOBAL: RegExp;
/** @type RegExp */
declare let FACEBOOK_REGEX: RegExp;
/** @type RegExp */
declare let FACEBOOK_REGEX_GLOBAL: RegExp;
/** @type RegExp */
declare let YOUTUBE_REGEX: RegExp;
/** @type RegExp */
declare let YOUTUBE_REGEX_GLOBAL: RegExp;
export {};
