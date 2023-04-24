/**
 * Regular expression to exactly match a single email address.
 * It has the following form: `/^...$/i`.
 */
export declare const EMAIL_REGEX: RegExp;
/**
 * Regular expression to find multiple email addresses in a text.
 * It has the following form: `/.../ig`.
 */
export declare const EMAIL_REGEX_GLOBAL: RegExp;
/**
 * The function extracts email addresses from a plain text.
 * Note that the function preserves the order of emails and keep duplicates.
 * @param text Text to search in.
 * @return Array of emails addresses found.
 * If no emails are found, the function returns an empty array.
 */
export declare function emailsFromText(text: string): string[];
/**
 * The function extracts email addresses from a list of URLs.
 * Basically it looks for all `mailto:` URLs and returns valid email addresses from them.
 * Note that the function preserves the order of emails and keep duplicates.
 * @param urls Array of URLs.
 * @return Array of emails addresses found.
 * If no emails are found, the function returns an empty array.
 */
export declare function emailsFromUrls(urls: string[]): string[];
/**
 * The function attempts to extract phone numbers from a text. Please note that
 * the results might not be accurate, since phone numbers appear in a large variety of formats and conventions.
 * If you encounter some problems, please [file an issue](https://github.com/apify/crawlee/issues).
 * @param text Text to search the phone numbers in.
 * @return Array of phone numbers found.
 * If no phone numbers are found, the function returns an empty array.
 */
export declare function phonesFromText(text: string): string[];
/**
 * Finds phone number links in an array of URLs and extracts the phone numbers from them.
 * Note that the phone number links look like `tel://123456789`, `tel:/123456789` or `tel:123456789`.
 * @param urls Array of URLs.
 * @return Array of phone numbers found.
 * If no phone numbers are found, the function returns an empty array.
 */
export declare function phonesFromUrls(urls: string[]): string[];
/**
 * Representation of social handles parsed from a HTML page.
 */
export interface SocialHandles {
    emails: string[];
    phones: string[];
    phonesUncertain: string[];
    linkedIns: string[];
    twitters: string[];
    instagrams: string[];
    facebooks: string[];
    youtubes: string[];
    tiktoks: string[];
    pinterests: string[];
    discords: string[];
}
/**
 * The function attempts to extract emails, phone numbers and social profile URLs from a HTML document,
 * specifically LinkedIn, Twitter, Instagram and Facebook profile URLs.
 * The function removes duplicates from the resulting arrays and sorts the items alphabetically.
 *
 * Note that the `phones` field contains phone numbers extracted from the special phone links
 * such as `[call us](tel:+1234556789)` (see {@apilink phonesFromUrls})
 * and potentially other sources with high certainty, while `phonesUncertain` contains phone numbers
 * extracted from the plain text, which might be very inaccurate.
 *
 * **Example usage:**
 * ```typescript
 * import { launchPuppeteer, social } from 'crawlee';
 *
 * const browser = await launchPuppeteer();
 * const page = await browser.newPage();
 * await page.goto('http://www.example.com');
 * const html = await page.content();
 *
 * const result = social.parseHandlesFromHtml(html);
 * console.log('Social handles:');
 * console.dir(result);
 * ```
 *
 * @param html HTML text
 * @param [data] Optional object which will receive the `text` and `$` properties
 *   that contain text content of the HTML and `cheerio` object, respectively. This is an optimization
 *   so that the caller doesn't need to parse the HTML document again, if needed.
 * @return An object with the social handles.
 */
export declare function parseHandlesFromHtml(html: string, data?: Record<string, unknown> | null): SocialHandles;
/**
 * Regular expression to exactly match a single LinkedIn profile URL.
 * It has the following form: `/^...$/i` and matches URLs such as:
 * ```
 * https://www.linkedin.com/in/alan-turing
 * en.linkedin.com/in/alan-turing
 * linkedin.com/in/alan-turing
 * https://www.linkedin.com/company/linkedin/
 * ```
 *
 * The regular expression does NOT match URLs with additional
 * subdirectories or query parameters, such as:
 * ```
 * https://www.linkedin.com/in/linus-torvalds/latest-activity
 * ```
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * if (social.LINKEDIN_REGEX.test('https://www.linkedin.com/in/alan-turing')) {
 *     console.log('Match!');
 * }
 * ```
 */
export declare const LINKEDIN_REGEX: RegExp;
/**
 * Regular expression to find multiple LinkedIn profile URLs in a text or HTML.
 * It has the following form: `/.../ig` and matches URLs such as:
 * ```
 * https://www.linkedin.com/in/alan-turing
 * en.linkedin.com/in/alan-turing
 * linkedin.com/in/alan-turing
 * https://www.linkedin.com/company/linkedin/
 * ```
 *
 * If the profile URL contains subdirectories or query parameters, the regular expression
 * extracts just the base part of the profile URL. For example, from text such as:
 * ```
 * https://www.linkedin.com/in/linus-torvalds/latest-activity
 * ```
 * the expression extracts just the following base URL:
 * ```
 * https://www.linkedin.com/in/linus-torvalds
 * ```
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * const matches = text.match(social.LINKEDIN_REGEX_GLOBAL);
 * if (matches) console.log(`${matches.length} LinkedIn profiles found!`);
 * ```
 */
export declare const LINKEDIN_REGEX_GLOBAL: RegExp;
/**
 * Regular expression to exactly match a single Instagram profile URL.
 * It has the following form: `/^...$/i` and matches URLs such as:
 * ```
 * https://www.instagram.com/old_prague
 * www.instagram.com/old_prague/
 * instagr.am/old_prague
 * ```
 *
 * The regular expression does NOT match URLs with additional
 * subdirectories or query parameters, such as:
 * ```
 * https://www.instagram.com/cristiano/followers
 * ```
 *
 *  It also does NOT match the following URLs:
 * ```
 * https://www.instagram.com/explore/
 * https://www.instagram.com/_n/
 * https://www.instagram.com/_u/
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * if (social.INSTAGRAM_REGEX.test('https://www.instagram.com/old_prague')) {
 *     console.log('Match!');
 * }
 * ```
 */
export declare const INSTAGRAM_REGEX: RegExp;
/**
 * Regular expression to find multiple Instagram profile URLs in a text or HTML.
 * It has the following form: `/.../ig` and matches URLs such as:
 * ```
 * https://www.instagram.com/old_prague
 * www.instagram.com/old_prague/
 * instagr.am/old_prague
 * ```
 *
* If the profile URL contains subdirectories or query parameters, the regular expression
* extracts just the base part of the profile URL. For example, from text such as:
* ```
* https://www.instagram.com/cristiano/followers
* ```
* the expression extracts just the following base URL:
* ```
* https://www.instagram.com/cristiano
* ```
*
* The regular expression does NOT match the following URLs:
* ```
* https://www.instagram.com/explore/
* https://www.instagram.com/_n/
* https://www.instagram.com/_u/
* ```
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * const matches = text.match(social.INSTAGRAM_REGEX_GLOBAL);
 * if (matches) console.log(`${matches.length} Instagram profiles found!`);
 * ```
 */
export declare const INSTAGRAM_REGEX_GLOBAL: RegExp;
/**
 * Regular expression to exactly match a single Twitter profile URL.
 * It has the following form: `/^...$/i` and matches URLs such as:
 * ```
 * https://www.twitter.com/apify
 * twitter.com/apify
 * ```
 *
 * The regular expression does NOT match URLs with additional
 * subdirectories or query parameters, such as:
 * ```
 * https://www.twitter.com/realdonaldtrump/following
 * ```
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * if (social.TWITTER_REGEX.test('https://www.twitter.com/apify')) {
 *     console.log('Match!');
 * }
 * ```
 */
export declare const TWITTER_REGEX: RegExp;
/**
 * Regular expression to find multiple Twitter profile URLs in a text or HTML.
 * It has the following form: `/.../ig` and matches URLs such as:
 * ```
 * https://www.twitter.com/apify
 * twitter.com/apify
 * ```
 *
 * If the profile URL contains subdirectories or query parameters, the regular expression
 * extracts just the base part of the profile URL. For example, from text such as:
 * ```
 * https://www.twitter.com/realdonaldtrump/following
 * ```
 * the expression extracts only the following base URL:
 * ```
 * https://www.twitter.com/realdonaldtrump
 * ```
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * const matches = text.match(social.TWITTER_REGEX_STRING);
 * if (matches) console.log(`${matches.length} Twitter profiles found!`);
 * ```
 */
export declare const TWITTER_REGEX_GLOBAL: RegExp;
/**
 * Regular expression to exactly match a single Facebook profile URL.
 * It has the following form: `/^...$/i` and matches URLs such as:
 * ```
 * https://www.facebook.com/apifytech
 * facebook.com/apifytech
 * fb.com/apifytech
 * https://www.facebook.com/profile.php?id=123456789
 * ```
 *
 * The regular expression does NOT match URLs with additional
 * subdirectories or query parameters, such as:
 * ```
 * https://www.facebook.com/apifytech/photos
 * ```
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * if (social.FACEBOOK_REGEX.test('https://www.facebook.com/apifytech')) {
 *     console.log('Match!');
 * }
 * ```
 */
export declare const FACEBOOK_REGEX: RegExp;
/**
 * Regular expression to find multiple Facebook profile URLs in a text or HTML.
 * It has the following form: `/.../ig` and matches URLs such as:
 * ```
 * https://www.facebook.com/apifytech
 * facebook.com/apifytech
 * fb.com/apifytech
 * ```
 *
 * If the profile URL contains subdirectories or query parameters, the regular expression
 * extracts just the base part of the profile URL. For example, from text such as:
 * ```
 * https://www.facebook.com/apifytech/photos
 * ```
 * the expression extracts only the following base URL:
 * ```
 * https://www.facebook.com/apifytech
 * ```
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * const matches = text.match(social.FACEBOOK_REGEX_GLOBAL);
 * if (matches) console.log(`${matches.length} Facebook profiles found!`);
 * ```
 */
export declare const FACEBOOK_REGEX_GLOBAL: RegExp;
/**
 * Regular expression to exactly match a single Youtube channel, user or video URL.
 * It has the following form: `/^...$/i` and matches URLs such as:
 * ```
 * https://www.youtube.com/watch?v=kM7YfhfkiEE
 * https://youtu.be/kM7YfhfkiEE
 * https://www.youtube.com/c/TrapNation
 * https://www.youtube.com/channel/UCklie6BM0fhFvzWYqQVoCTA
 * https://www.youtube.com/user/pewdiepie
 * ```
 *
 * Please note that this won't match URLs like https://www.youtube.com/pewdiepie that redirect to /user or /channel.
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * if (social.YOUTUBE_REGEX.test('https://www.youtube.com/watch?v=kM7YfhfkiEE')) {
 *     console.log('Match!');
 * }
 * ```
 */
export declare const YOUTUBE_REGEX: RegExp;
/**
 * Regular expression to find multiple Youtube channel, user or video URLs in a text or HTML.
 * It has the following form: `/.../ig` and matches URLs such as:
 * ```
 * https://www.youtube.com/watch?v=kM7YfhfkiEE
 * https://youtu.be/kM7YfhfkiEE
 * https://www.youtube.com/c/TrapNation
 * https://www.youtube.com/channel/UCklie6BM0fhFvzWYqQVoCTA
 * https://www.youtube.com/user/pewdiepie
 * ```
 *
 * Please note that this won't match URLs like https://www.youtube.com/pewdiepie that redirect to /user or /channel.
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * const matches = text.match(social.YOUTUBE_REGEX_GLOBAL);
 * if (matches) console.log(`${matches.length} Youtube videos found!`);
 * ```
 */
export declare const YOUTUBE_REGEX_GLOBAL: RegExp;
/**
 * Regular expression to exactly match a Tiktok video or user account.
 * It has the following form: `/^...$/i` and matches URLs such as:
 * ```
 * https://www.tiktok.com/trending?shareId=123456789
 * https://www.tiktok.com/embed/123456789
 * https://m.tiktok.com/v/123456789
 * https://www.tiktok.com/@user
 * https://www.tiktok.com/@user-account.pro
 * https://www.tiktok.com/@user/video/123456789
 * ```
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * if (social.TIKTOK_REGEX.test('https://www.tiktok.com/trending?shareId=123456789')) {
 *     console.log('Match!');
 * }
 * ```
 */
export declare const TIKTOK_REGEX: RegExp;
/**
 * Regular expression to find multiple Tiktok videos or user accounts in a text or HTML.
 * It has the following form: `/.../ig` and matches URLs such as:
 * ```
 * https://www.tiktok.com/trending?shareId=123456789
 * https://www.tiktok.com/embed/123456789
 * https://m.tiktok.com/v/123456789
 * https://www.tiktok.com/@user
 * https://www.tiktok.com/@user-account.pro
 * https://www.tiktok.com/@user/video/123456789
 * ```
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * const matches = text.match(social.TIKTOK_REGEX_GLOBAL);
 * if (matches) console.log(`${matches.length} Tiktok profiles/videos found!`);
 * ```
 */
export declare const TIKTOK_REGEX_GLOBAL: RegExp;
/**
 * Regular expression to exactly match a Pinterest pin, user or user's board.
 * It has the following form: `/^...$/i` and matches URLs such as:
 * ```
 * https://pinterest.com/pin/123456789
 * https://www.pinterest.cz/pin/123456789
 * https://www.pinterest.com/user
 * https://uk.pinterest.com/user
 * https://www.pinterest.co.uk/user
 * pinterest.com/user_name.gold
 * https://cz.pinterest.com/user/board
 * ```
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * if (social.PINTEREST_REGEX.test('https://pinterest.com/pin/123456789')) {
 *     console.log('Match!');
 * }
 * ```
 */
export declare const PINTEREST_REGEX: RegExp;
/**
 * Regular expression to find multiple Pinterest pins, users or boards in a text or HTML.
 * It has the following form: `/.../ig` and matches URLs such as:
 * ```
 * https://pinterest.com/pin/123456789
 * https://www.pinterest.cz/pin/123456789
 * https://www.pinterest.com/user
 * https://uk.pinterest.com/user
 * https://www.pinterest.co.uk/user
 * pinterest.com/user_name.gold
 * https://cz.pinterest.com/user/board
 * ```
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * const matches = text.match(social.PINTEREST_REGEX_GLOBAL);
 * if (matches) console.log(`${matches.length} Pinterest pins found!`);
 * ```
 */
export declare const PINTEREST_REGEX_GLOBAL: RegExp;
/**
 * Regular expression to exactly match a Discord invite or channel.
 * It has the following form: `/^...$/i` and matches URLs such as:
 * ```
 * https://discord.gg/discord-developers
 * https://discord.com/invite/jyEM2PRvMU
 * https://discordapp.com/channels/1234
 * https://discord.com/channels/1234/1234
 * discord.gg/discord-developers
 * ```
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * if (social.DISCORD_REGEX.test('https://discord.gg/discord-developers')) {
 *     console.log('Match!');
 * }
 * ```
 */
export declare const DISCORD_REGEX: RegExp;
/**
 * Regular expression to find multiple Discord channels or invites in a text or HTML.
 * It has the following form: `/.../ig` and matches URLs such as:
 * ```
 * https://discord.gg/discord-developers
 * https://discord.com/invite/jyEM2PRvMU
 * https://discordapp.com/channels/1234
 * https://discord.com/channels/1234/1234
 * discord.gg/discord-developers
 * ```
 *
 * Example usage:
 * ```
 * import { social } from 'crawlee';
 *
 * const matches = text.match(social.DISCORD_REGEX_GLOBAL);
 * if (matches) console.log(`${matches.length} Discord channels found!`);
 * ```
 */
export declare const DISCORD_REGEX_GLOBAL: RegExp;
//# sourceMappingURL=social.d.ts.map