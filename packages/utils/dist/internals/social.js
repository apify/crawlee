"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISCORD_REGEX_GLOBAL = exports.DISCORD_REGEX = exports.PINTEREST_REGEX_GLOBAL = exports.PINTEREST_REGEX = exports.TIKTOK_REGEX_GLOBAL = exports.TIKTOK_REGEX = exports.YOUTUBE_REGEX_GLOBAL = exports.YOUTUBE_REGEX = exports.FACEBOOK_REGEX_GLOBAL = exports.FACEBOOK_REGEX = exports.TWITTER_REGEX_GLOBAL = exports.TWITTER_REGEX = exports.INSTAGRAM_REGEX_GLOBAL = exports.INSTAGRAM_REGEX = exports.LINKEDIN_REGEX_GLOBAL = exports.LINKEDIN_REGEX = exports.parseHandlesFromHtml = exports.phonesFromUrls = exports.phonesFromText = exports.emailsFromUrls = exports.emailsFromText = exports.EMAIL_REGEX_GLOBAL = exports.EMAIL_REGEX = void 0;
const tslib_1 = require("tslib");
const cheerio_1 = tslib_1.__importDefault(require("cheerio"));
const cheerio_2 = require("./cheerio");
// Regex inspired by https://zapier.com/blog/extract-links-email-phone-regex/
// eslint-disable-next-line max-len
const EMAIL_REGEX_STRING = '(?:[a-z0-9!#$%&\'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&\'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\\])';
/**
 * Regular expression to exactly match a single email address.
 * It has the following form: `/^...$/i`.
 */
exports.EMAIL_REGEX = new RegExp(`^${EMAIL_REGEX_STRING}$`, 'i');
/**
 * Regular expression to find multiple email addresses in a text.
 * It has the following form: `/.../ig`.
 */
exports.EMAIL_REGEX_GLOBAL = new RegExp(EMAIL_REGEX_STRING, 'ig');
const EMAIL_URL_PREFIX_REGEX = /^mailto:/i;
/**
 * The function extracts email addresses from a plain text.
 * Note that the function preserves the order of emails and keep duplicates.
 * @param text Text to search in.
 * @return Array of emails addresses found.
 * If no emails are found, the function returns an empty array.
 */
function emailsFromText(text) {
    if (typeof text !== 'string')
        return [];
    return text.match(exports.EMAIL_REGEX_GLOBAL) || [];
}
exports.emailsFromText = emailsFromText;
/**
 * The function extracts email addresses from a list of URLs.
 * Basically it looks for all `mailto:` URLs and returns valid email addresses from them.
 * Note that the function preserves the order of emails and keep duplicates.
 * @param urls Array of URLs.
 * @return Array of emails addresses found.
 * If no emails are found, the function returns an empty array.
 */
function emailsFromUrls(urls) {
    if (!Array.isArray(urls))
        throw new Error('The "urls" parameter must be an array');
    const emails = [];
    for (const url of urls) {
        if (!url)
            continue;
        if (!EMAIL_URL_PREFIX_REGEX.test(url))
            continue;
        const email = url.replace(EMAIL_URL_PREFIX_REGEX, '').trim();
        if (exports.EMAIL_REGEX.test(email))
            emails.push(email);
    }
    return emails;
}
exports.emailsFromUrls = emailsFromUrls;
// Supports URLs starting with `tel://`, `tel:/` and `tel:`, and similarly `phone`, `telephone` and `callto`
const PHONE_URL_PREFIX_REGEX = /^(tel|phone|telephone|callto):(\/)?(\/)?/i;
// It's pretty much impossible (and unmaintainable) to have just one large regular expression for all possible phone numbers.
// So here we define various regular expression for typical phone number patterns, which are then used to compile
// a single large regular expressions. Add more patterns as needed.
// NOTE: The patterns are tested in the order as written below, so the longer ones should be before the shorter ones!
const PHONE_REGEXS_STRINGS = [
    // 775123456
    '[0-9]{6,15}',
    // 1(413)555-2378 or 1(413)555.2378 or 1 (413) 555-2378 or 1 (413) 555 2378 or (303) 494-2320
    '([0-9]{1,4}( )?)?\\([0-9]{2,4}\\)( )?[0-9]{2,4}(( )?(-|.))?( )?[0-9]{2,6}',
    // (51) 5667-9987 or (19)94138-9398
    '\\([0-9]{2}\\)( )?[0-9]{4,5}-[0-9]{4}',
    // 1(262) 955-95-79 or 1(262)955.95.79
    '([0-9]{1,4}( )?)?\\([0-9]{2,4}\\)( )?[0-9]{2,4}(( )?(-|.))?( )?[0-9]{2,6}',
    // 413-577-1234-564
    '[0-9]{2,4}-[0-9]{2,4}-[0-9]{2,4}-[0-9]{2,6}',
    // 413-577-1234
    '[0-9]{2,4}-[0-9]{2,4}-[0-9]{2,6}',
    // 413-577
    '[0-9]{2,4}-[0-9]{2,6}',
    // 413.577.1234.564
    '[0-9]{2,4}\\.[0-9]{2,4}\\.[0-9]{2,4}\\.[0-9]{2,6}',
    // 413.577.1234
    '[0-9]{2,4}\\.[0-9]{2,4}\\.[0-9]{2,6}',
    // 413.577
    '[0-9]{2,4}\\.[0-9]{2,6}',
    // 413 577 1234 564
    '[0-9]{2,4} [0-9]{2,4} [0-9]{2,4} [0-9]{2,6}',
    // 413 577 1234
    '[0-9]{2,4} [0-9]{2,4} [0-9]{2,6}',
    // 123 4567
    '[0-9]{2,4} [0-9]{3,8}',
    // All phones might be prefixed with '+' or '00'
].map((regex) => `(00|\\+)?${regex}`);
// The minimum number of digits a phone number can contain.
// That's because the PHONE_REGEXS_STRINGS patterns are quite wide and report a lot of false positives.
const PHONE_MIN_DIGITS = 7;
// These are patterns that might be matched by PHONE_REGEXS_STRINGS,
// but which are most likely not phone numbers. Add more patterns as needed.
const SKIP_PHONE_REGEXS = [
    // 2018-11-10
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}$',
];
const PHONE_REGEX_GLOBAL = new RegExp(`(${PHONE_REGEXS_STRINGS.join('|')})`, 'ig');
const PHONE_REGEX = new RegExp(`^(${PHONE_REGEXS_STRINGS.join('|')})$`, 'i');
const SKIP_PHONE_REGEX = new RegExp(`^(${SKIP_PHONE_REGEXS.join('|')})$`, 'i');
/**
 * The function attempts to extract phone numbers from a text. Please note that
 * the results might not be accurate, since phone numbers appear in a large variety of formats and conventions.
 * If you encounter some problems, please [file an issue](https://github.com/apify/crawlee/issues).
 * @param text Text to search the phone numbers in.
 * @return Array of phone numbers found.
 * If no phone numbers are found, the function returns an empty array.
 */
function phonesFromText(text) {
    if (typeof text !== 'string')
        return [];
    let phones = text.match(PHONE_REGEX_GLOBAL) || [];
    phones = phones.filter((phone) => {
        if (!phone)
            return false;
        // Skip too short phones, they are most likely incorrect
        if (phone.match(/[0-9]/g).length < PHONE_MIN_DIGITS)
            return false;
        // Skip phone numbers matching specific patterns
        if (SKIP_PHONE_REGEX.test(phone))
            return false;
        return true;
    });
    return phones;
}
exports.phonesFromText = phonesFromText;
/**
 * Finds phone number links in an array of URLs and extracts the phone numbers from them.
 * Note that the phone number links look like `tel://123456789`, `tel:/123456789` or `tel:123456789`.
 * @param urls Array of URLs.
 * @return Array of phone numbers found.
 * If no phone numbers are found, the function returns an empty array.
 */
function phonesFromUrls(urls) {
    if (!Array.isArray(urls))
        throw new Error('The "urls" parameter must be an array');
    const phones = [];
    for (const url of urls) {
        if (!url)
            continue;
        if (!PHONE_URL_PREFIX_REGEX.test(url))
            continue;
        const phone = url.replace(PHONE_URL_PREFIX_REGEX, '').trim();
        if (PHONE_REGEX.test(phone))
            phones.push(phone);
    }
    return phones;
}
exports.phonesFromUrls = phonesFromUrls;
// NOTEs about the regular expressions
// - They have just a single matching group for the profile username, all other groups are non-matching
// - They use a negative lookbehind and lookahead assertions, which are only supported in Node 8+.
//   They are used to prevent matching URLs in strings like "blahttps://www.example.com"
// eslint-disable-next-line max-len
const LINKEDIN_REGEX_STRING = '(?<!\\w)(?:(?:http(?:s)?:\\/\\/)?(?:(?:(?:[a-z]+\\.)?linkedin\\.com\\/(?:in|company)\\/)([a-z0-9\\-_%=]{2,60})(?![a-z0-9\\-_%=])))(?:\\/)?';
// eslint-disable-next-line max-len
const INSTAGRAM_REGEX_STRING = '(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:(?:www\\.)?(?:instagram\\.com|instagr\\.am)\\/)(?!explore|_n|_u)([a-z0-9_.]{2,30})(?![a-z0-9_.])(?:/)?';
const TWITTER_RESERVED_PATHS = 'oauth|account|tos|privacy|signup|home|hashtag|search|login|widgets|i|settings|start|share|intent|oct';
// eslint-disable-next-line max-len
const TWITTER_REGEX_STRING = `(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:www.)?(?:twitter.com)\\/(?!(?:${TWITTER_RESERVED_PATHS})(?:[\\'\\"\\?\\.\\/]|$))([a-z0-9_]{1,15})(?![a-z0-9_])(?:/)?`;
// eslint-disable-next-line max-len
const FACEBOOK_RESERVED_PATHS = 'rsrc\\.php|apps|groups|events|l\\.php|friends|images|photo.php|chat|ajax|dyi|common|policies|login|recover|reg|help|security|messages|marketplace|pages|live|bookmarks|games|fundraisers|saved|gaming|salesgroups|jobs|people|ads|ad_campaign|weather|offers|recommendations|crisisresponse|onthisday|developers|settings|connect|business|plugins|intern|sharer';
// eslint-disable-next-line max-len
const FACEBOOK_REGEX_STRING = `(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:www.)?(?:facebook.com|fb.com)\\/(?!(?:${FACEBOOK_RESERVED_PATHS})(?:[\\'\\"\\?\\.\\/]|$))(profile\\.php\\?id\\=[0-9]{3,20}|(?!profile\\.php)[a-z0-9\\.]{5,51})(?![a-z0-9\\.])(?:/)?`;
// eslint-disable-next-line max-len
const YOUTUBE_REGEX_STRING = '(?<!\\w)(?:https?:\\/\\/)?(?:youtu\\.be\\/|(?:www\\.|m\\.)?youtube\\.com(?:\\/(?:watch|v|embed|user|c(?:hannel)?)(?:\\.php)?)?(?:\\?[^ ]*v=|\\/))([a-zA-Z0-9\\-_]{2,100})';
// eslint-disable-next-line max-len
const TIKTOK_REGEX_STRING = '(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:(?:www|m)\\.)?(?:tiktok\\.com)\\/(((?:(?:v|embed|trending)(?:\\?shareId=|\\/))[0-9]{2,50}(?![0-9]))|(?:@)[a-z0-9\\-_\\.]+((?:\\/video\\/)[0-9]{2,50}(?![0-9]))?)(?:\\/)?';
// eslint-disable-next-line max-len
const PINTEREST_REGEX_STRING = '(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:(?:(?:(?:www\\.)?pinterest(?:\\.com|(?:\\.[a-z]{2}){1,2}))|(?:[a-z]{2})\\.pinterest\\.com)(?:\\/))((pin\\/[0-9]{2,50})|((?!pin)[a-z0-9\\-_\\.]+(\\/[a-z0-9\\-_\\.]+)?))(?:\\/)?';
// eslint-disable-next-line max-len
const DISCORD_REGEX_STRING = '(?<!\\w)(?:https?:\\/\\/)?(?:www\\.)?((?:(?:(?:canary|ptb).)?(?:discord|discordapp)\\.com\\/channels(?:\\/)[0-9]{2,50}(\\/[0-9]{2,50})*)|(?:(?:(?:canary|ptb).)?(?:discord\\.(?:com|me|li|gg|io)|discordapp\\.com)(?:\\/invite)?)\\/(?!channels)[a-z0-9\\-_]{2,50})(?:\\/)?';
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
function parseHandlesFromHtml(html, data = null) {
    const result = {
        emails: [],
        phones: [],
        phonesUncertain: [],
        linkedIns: [],
        twitters: [],
        instagrams: [],
        facebooks: [],
        youtubes: [],
        tiktoks: [],
        pinterests: [],
        discords: [],
    };
    if (typeof html !== 'string')
        return result;
    const $ = cheerio_1.default.load(html, { decodeEntities: true });
    if (data)
        data.$ = $;
    const text = (0, cheerio_2.htmlToText)($);
    if (data)
        data.text = text;
    // Find all <a> links with href tag
    const linkUrls = [];
    $('a[href]').each((_index, elem) => {
        if (elem)
            linkUrls.push($(elem).attr('href'));
    });
    result.emails = emailsFromUrls(linkUrls).concat(emailsFromText(text));
    result.phones = phonesFromUrls(linkUrls);
    result.phonesUncertain = phonesFromText(text);
    // Note that these regexps extract just the base profile path. For example for
    //  https://www.linkedin.com/in/carl-newman-123456a/detail/recent-activity/
    // they match just:
    //  https://www.linkedin.com/in/carl-newman-123456a
    result.linkedIns = html.match(exports.LINKEDIN_REGEX_GLOBAL) || [];
    result.twitters = html.match(exports.TWITTER_REGEX_GLOBAL) || [];
    result.instagrams = html.match(exports.INSTAGRAM_REGEX_GLOBAL) || [];
    result.facebooks = html.match(exports.FACEBOOK_REGEX_GLOBAL) || [];
    result.youtubes = html.match(exports.YOUTUBE_REGEX_GLOBAL) || [];
    result.tiktoks = html.match(exports.TIKTOK_REGEX_GLOBAL) || [];
    result.pinterests = html.match(exports.PINTEREST_REGEX_GLOBAL) || [];
    result.discords = html.match(exports.DISCORD_REGEX_GLOBAL) || [];
    // Sort and deduplicate handles
    for (const key of Object.keys(result)) {
        result[key].sort();
        result[key] = [...new Set(result[key])].sort();
    }
    return result;
}
exports.parseHandlesFromHtml = parseHandlesFromHtml;
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
exports.LINKEDIN_REGEX = new RegExp(`^${LINKEDIN_REGEX_STRING}$`, 'i');
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
exports.LINKEDIN_REGEX_GLOBAL = new RegExp(LINKEDIN_REGEX_STRING, 'ig');
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
exports.INSTAGRAM_REGEX = new RegExp(`^${INSTAGRAM_REGEX_STRING}$`, 'i');
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
exports.INSTAGRAM_REGEX_GLOBAL = new RegExp(INSTAGRAM_REGEX_STRING, 'ig');
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
exports.TWITTER_REGEX = new RegExp(`^${TWITTER_REGEX_STRING}$`, 'i');
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
exports.TWITTER_REGEX_GLOBAL = new RegExp(TWITTER_REGEX_STRING, 'ig');
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
exports.FACEBOOK_REGEX = new RegExp(`^${FACEBOOK_REGEX_STRING}$`, 'i');
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
exports.FACEBOOK_REGEX_GLOBAL = new RegExp(FACEBOOK_REGEX_STRING, 'ig');
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
exports.YOUTUBE_REGEX = new RegExp(`^${YOUTUBE_REGEX_STRING}$`, 'i');
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
exports.YOUTUBE_REGEX_GLOBAL = new RegExp(YOUTUBE_REGEX_STRING, 'ig');
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
exports.TIKTOK_REGEX = new RegExp(`^${TIKTOK_REGEX_STRING}$`, 'i');
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
exports.TIKTOK_REGEX_GLOBAL = new RegExp(TIKTOK_REGEX_STRING, 'ig');
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
exports.PINTEREST_REGEX = new RegExp(`^${PINTEREST_REGEX_STRING}$`, 'i');
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
exports.PINTEREST_REGEX_GLOBAL = new RegExp(PINTEREST_REGEX_STRING, 'ig');
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
exports.DISCORD_REGEX = new RegExp(`^${DISCORD_REGEX_STRING}$`, 'i');
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
exports.DISCORD_REGEX_GLOBAL = new RegExp(DISCORD_REGEX_STRING, 'ig');
//# sourceMappingURL=social.js.map