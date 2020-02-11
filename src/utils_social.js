/* eslint-disable no-continue */
import _ from 'underscore';
import cheerio from 'cheerio';
import log from 'apify-shared/log';
import { publicUtils } from './utils';

// TODO: We could support URLs like https://www.linkedin.com/company/some-company-inc

// Regex inspired by https://zapier.com/blog/extract-links-email-phone-regex/
// eslint-disable-next-line max-len
const EMAIL_REGEX_STRING = '(?:[a-z0-9!#$%&\'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&\'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\\])';

/**
 * Regular expression to exactly match a single email address.
 * It has the following form: `/^...$/i`.
 * @type {RegExp}
 * @memberOf social
 */
const EMAIL_REGEX = new RegExp(`^${EMAIL_REGEX_STRING}$`, 'i');

/**
 * Regular expression to find multiple email addresses in a text.
 * It has the following form: `/.../ig`.
 * @type {RegExp}
 * @memberOf social
 */
const EMAIL_REGEX_GLOBAL = new RegExp(EMAIL_REGEX_STRING, 'ig');


const EMAIL_URL_PREFIX_REGEX = /^mailto:/i;


/**
 * The function extracts email addresses from a plain text.
 * Note that the function preserves the order of emails and keep duplicates.
 * @param {String} text Text to search in.
 * @return {String[]} Array of emails addresses found.
 * If no emails are found, the function returns an empty array.
 * @memberOf social
 */
const emailsFromText = (text) => {
    if (!_.isString(text)) return [];
    return text.match(EMAIL_REGEX_GLOBAL) || [];
};


/**
 * The function extracts email addresses from a list of URLs.
 * Basically it looks for all `mailto:` URLs and returns valid email addresses from them.
 * Note that the function preserves the order of emails and keep duplicates.
 * @param {String[]} urls Array of URLs.
 * @return {String[]} Array of emails addresses found.
 * If no emails are found, the function returns an empty array.
 * @memberOf social
 */
const emailsFromUrls = (urls) => {
    if (!Array.isArray(urls)) throw new Error('The "urls" parameter must be an array');

    const emails = [];
    for (const url of urls) {
        if (!url) continue;
        if (!EMAIL_URL_PREFIX_REGEX.test(url)) continue;

        const email = url.replace(EMAIL_URL_PREFIX_REGEX, '').trim();
        if (EMAIL_REGEX.test(email)) emails.push(email);
    }
    return emails;
};


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
];

// All phones might be prefixed with '+' or '00'
for (let i = 0; i < PHONE_REGEXS_STRINGS.length; i++) {
    PHONE_REGEXS_STRINGS[i] = `(00|\\+)?${PHONE_REGEXS_STRINGS[i]}`;
}

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
 * If you encounter some problems, please [file an issue](https://github.com/apifytech/apify-js/issues).
 * @param {String} text Text to search the phone numbers in.
 * @return {String[]} Array of phone numbers found.
 * If no phone numbers are found, the function returns an empty array.
 * @memberOf social
 */
const phonesFromText = (text) => {
    if (!_.isString(text)) return [];

    let phones = text.match(PHONE_REGEX_GLOBAL) || [];
    phones = phones.filter((phone) => {
        if (!phone) return false;

        // Skip too short phones, they are most likely incorrect
        if (phone.match(/[0-9]/g).length < PHONE_MIN_DIGITS) return false;

        // Skip phone numbers matching specific patterns
        if (SKIP_PHONE_REGEX.test(phone)) return false;

        return true;
    });

    return phones;
};


/**
 * Finds phone number links in an array of URLs and extracts the phone numbers from them.
 * Note that the phone number links look like `tel://123456789`, `tel:/123456789` or `tel:123456789`.
 * @param {String[]} urls Array of URLs.
 * @return {String[]} Array of phone numbers found.
 * If no phone numbers are found, the function returns an empty array.
 * @memberOf social
 */
const phonesFromUrls = (urls) => {
    if (!Array.isArray(urls)) throw new Error('The "urls" parameter must be an array');

    const phones = [];
    for (const url of urls) {
        if (!url) continue;
        if (!PHONE_URL_PREFIX_REGEX.test(url)) continue;

        const phone = url.replace(PHONE_URL_PREFIX_REGEX, '').trim();
        if (PHONE_REGEX.test(phone)) phones.push(phone);
    }
    return phones;
};

// NOTEs about the regular expressions
// - They have just a single matching group for the profile username, all other groups are non-matching
// - They use a negative lookbehind and lookahead assertions, which are only supported in Node 8+.
//   They are used to prevent matching URLs in strings like "blahttps://www.example.com"

// eslint-disable-next-line max-len
const LINKEDIN_REGEX_STRING = '(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:(?:[a-z]+\\.)?linkedin\\.com\\/in\\/)([a-z0-9\\-_%]{2,60})(?![a-z0-9\\-_%])(?:/)?';

// TODO: Skip https://www.instagram.com/explore/ !!! and "https://www.instagram.com/_n/", "https://www.instagram.com/_u/"
// eslint-disable-next-line max-len
const INSTAGRAM_REGEX_STRING = '(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:(?:www\\.)?(?:instagram\\.com|instagr\\.am)\\/)([a-z0-9_.]{2,30})(?![a-z0-9_.])(?:/)?';

const TWITTER_RESERVED_PATHS = 'oauth|account|tos|privacy|signup|home|hashtag|search|login|widgets|i|settings|start|share|intent|oct';
// eslint-disable-next-line max-len, quotes
const TWITTER_REGEX_STRING = `(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:www.)?(?:twitter.com)\\/(?!(?:${TWITTER_RESERVED_PATHS})(?:[\\'\\"\\?\\.\\/]|$))([a-z0-9_]{1,15})(?![a-z0-9_])(?:/)?`;

// eslint-disable-next-line max-len, quotes
const FACEBOOK_RESERVED_PATHS = 'rsrc\\.php|apps|groups|events|l\\.php|friends|images|photo.php|chat|ajax|dyi|common|policies|login|recover|reg|help|security|messages|marketplace|pages|live|bookmarks|games|fundraisers|saved|gaming|salesgroups|jobs|people|ads|ad_campaign|weather|offers|recommendations|crisisresponse|onthisday|developers|settings|connect|business|plugins|intern|sharer';
// eslint-disable-next-line max-len, quotes
const FACEBOOK_REGEX_STRING = `(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:www.)?(?:facebook.com|fb.com)\\/(?!(?:${FACEBOOK_RESERVED_PATHS})(?:[\\'\\"\\?\\.\\/]|$))(profile\\.php\\?id\\=[0-9]{3,20}|(?!profile\\.php)[a-z0-9\\.]{5,51})(?![a-z0-9\\.])(?:/)?`;
// eslint-disable-next-line max-len, quotes
const YOUTUBE_REGEX_STRING = '(?:https?:\\/\\/)?(?:youtu\\.be\\/|(?:www\\.|m\\.)?youtube\\.com\\/(?:watch|v|embed)(?:\\.php)?(?:\\?.*v=|\\/))([a-zA-Z0-9\\-_]+)';

/** @type RegExp */
let LINKEDIN_REGEX;
/** @type RegExp */
let LINKEDIN_REGEX_GLOBAL;
/** @type RegExp */
let INSTAGRAM_REGEX;
/** @type RegExp */
let INSTAGRAM_REGEX_GLOBAL;
/** @type RegExp */
let TWITTER_REGEX;
/** @type RegExp */
let TWITTER_REGEX_GLOBAL;
/** @type RegExp */
let FACEBOOK_REGEX;
/** @type RegExp */
let FACEBOOK_REGEX_GLOBAL;
/** @type RegExp */
let YOUTUBE_REGEX;
/** @type RegExp */
let YOUTUBE_REGEX_GLOBAL;

try {
    /**
     * Regular expression to exactly match a single LinkedIn profile URL.
     * It has the following form: `/^...$/i` and matches URLs such as:
     * ```
     * https://www.linkedin.com/in/alan-turing
     * en.linkedin.com/in/alan-turing
     * linkedin.com/in/alan-turing
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
     * if (Apify.utils.social.LINKEDIN_REGEX.test('https://www.linkedin.com/in/alan-turing')) {
     *     console.log('Match!');
     * }
     * ```
     * @type {RegExp}
     * @memberOf social
     */
    LINKEDIN_REGEX = new RegExp(`^${LINKEDIN_REGEX_STRING}$`, 'i');

    /**
     * Regular expression to find multiple LinkedIn profile URLs in a text or HTML.
     * It has the following form: `/.../ig` and matches URLs such as:
     * ```
     * https://www.linkedin.com/in/alan-turing
     * en.linkedin.com/in/alan-turing
     * linkedin.com/in/alan-turing
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
     * const matches = text.match(Apify.utils.social.LINKEDIN_REGEX_GLOBAL);
     * if (matches) console.log(`${matches.length} LinkedIn profiles found!`);
     * ```
     * @type {RegExp}
     * @memberOf social
     */
    LINKEDIN_REGEX_GLOBAL = new RegExp(LINKEDIN_REGEX_STRING, 'ig');

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
     * Example usage:
     * ```
     * if (Apify.utils.social.INSTAGRAM_REGEX.test('https://www.instagram.com/old_prague')) {
     *     console.log('Match!');
     * }
     * ```
     * @type {RegExp}
     * @memberOf social
     */
    INSTAGRAM_REGEX = new RegExp(`^${INSTAGRAM_REGEX_STRING}$`, 'i');

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
     * Example usage:
     * ```
     * const matches = text.match(Apify.utils.social.INSTAGRAM_REGEX_GLOBAL);
     * if (matches) console.log(`${matches.length} Instagram profiles found!`);
     * ```
     * @type {RegExp}
     * @memberOf social
     */
    INSTAGRAM_REGEX_GLOBAL = new RegExp(INSTAGRAM_REGEX_STRING, 'ig');

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
     * if (Apify.utils.social.TWITTER_REGEX.test('https://www.twitter.com/apify')) {
     *     console.log('Match!');
     * }
     * ```
     * @type {RegExp}
     * @memberOf social
     */
    TWITTER_REGEX = new RegExp(`^${TWITTER_REGEX_STRING}$`, 'i');

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
     * const matches = text.match(Apify.utils.social.TWITTER_REGEX_STRING);
     * if (matches) console.log(`${matches.length} Twitter profiles found!`);
     * ```
     * @type {RegExp}
     * @memberOf social
     */
    TWITTER_REGEX_GLOBAL = new RegExp(TWITTER_REGEX_STRING, 'ig');

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
     * if (Apify.utils.social.FACEBOOK_REGEX.test('https://www.facebook.com/apifytech')) {
     *     console.log('Match!');
     * }
     * ```
     * @type {RegExp}
     * @memberOf social
     */
    FACEBOOK_REGEX = new RegExp(`^${FACEBOOK_REGEX_STRING}$`, 'i');

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
     * const matches = text.match(Apify.utils.social.FACEBOOK_REGEX_GLOBAL);
     * if (matches) console.log(`${matches.length} Facebook profiles found!`);
     * ```
     * @type {RegExp}
     * @memberOf social
     */
    FACEBOOK_REGEX_GLOBAL = new RegExp(FACEBOOK_REGEX_STRING, 'ig');

    /**
     * Regular expression to exactly match a single Youtube video URL.
     * It has the following form: `/^...$/i` and matches URLs such as:
     * ```
     * https://www.youtube.com/watch?v=kM7YfhfkiEE
     * https://youtu.be/kM7YfhfkiEE
     * ```
     *
     * Example usage:
     * ```
     * if (Apify.utils.social.YOUTUBE_REGEX.test('https://www.youtube.com/watch?v=kM7YfhfkiEE')) {
     *     console.log('Match!');
     * }
     * ```
     * @type {RegExp}
     * @memberOf social
     */
    YOUTUBE_REGEX = new RegExp(`^${YOUTUBE_REGEX_STRING}$`, 'i');

    /**
     * Regular expression to find multiple Youtube video URLs in a text or HTML.
     * It has the following form: `/.../ig` and matches URLs such as:
     * ```
     * https://www.youtube.com/watch?v=kM7YfhfkiEE
     * https://youtu.be/kM7YfhfkiEE
     * ```
     *
     * Example usage:
     * ```
     * const matches = text.match(Apify.utils.social.YOUTUBE_REGEX_GLOBAL);
     * if (matches) console.log(`${matches.length} Youtube videos found!`);
     * ```
     * @type {RegExp}
     * @memberOf social
     */
    YOUTUBE_REGEX_GLOBAL = new RegExp(YOUTUBE_REGEX_STRING, 'ig');
} catch (e) {
    // Older versions of Node don't support negative lookbehind and lookahead expressions.
    // Show warning instead of failing.
    if (e && e.message && e.message.includes('Invalid group')) {
        // eslint-disable-next-line max-len
        log.warning(`Your version of Node.js (${process.version}) doesn't support the regular expression syntax used by Apify.utils.social tools. The tools will not work. Please upgrade your Node.js to the latest version.`);
    } else {
        throw e;
    }
}

/**
 * Representation of social handles parsed from a HTML page.
 *
 * The object has the following structure:
 *
 * ```
 * {
 *   emails: String[],
 *   phones: String[],
 *   phonesUncertain: String[],
 *   linkedIns: String[],
 *   twitters: String[],
 *   instagrams: String[],
 *   facebooks: String[],
 *   youtubes: String[],
 * }
 * ```
 * @typedef SocialHandles
 * @property {String[]} emails
 * @property {String[]} phones
 * @property {String[]} phonesUncertain
 * @property {String[]} linkedIns
 * @property {String[]} twitters
 * @property {String[]} instagrams
 * @property {String[]} facebooks
 * @property {String[]} youtubes
 */

/**
 * The function attempts to extract emails, phone numbers and social profile URLs from a HTML document,
 * specifically LinkedIn, Twitter, Instagram and Facebook profile URLs.
 * The function removes duplicates from the resulting arrays and sorts the items alphabetically.
 *
 * Note that the `phones` field contains phone numbers extracted from the special phone links
 * such as `<a href="tel:+1234556789">call us</a>` (see [`social.phonesFromUrls()`](#social.phonesFromUrls)])
 * and potentially other sources with high certainty, while `phonesUncertain` contains phone numbers
 * extracted from the plain text, which might be very inaccurate.
 *
 * **Example usage:**
 * ```javascript
 * const Apify = require('apify');
 *
 * const browser = await Apify.launchPuppeteer();
 * const page = await browser.newPage();
 * await page.goto('http://www.example.com');
 * const html = await page.content();
 *
 * const result = Apify.utils.social.parseHandlesFromHtml(html);
 * console.log('Social handles:');
 * console.dir(result);
 * ```
 *
 * @param {String} html HTML text
 * @param {Object} data Optional object which will receive the `text` and `$` properties
 *   that contain text content of the HTML and `cheerio` object, respectively. This is an optimization
 *   so that the caller doesn't need to parse the HTML document again, if needed.
 * @return {SocialHandles} An object with the social handles.
 *
 * @memberOf social
 */
const parseHandlesFromHtml = (html, data = null) => {
    const result = {
        emails: [],
        phones: [],
        phonesUncertain: [],
        linkedIns: [],
        twitters: [],
        instagrams: [],
        facebooks: [],
        youtubes: [],
    };

    // TODO: maybe extract phone numbers from JSON+LD

    if (!_.isString(html)) return result;

    const $ = cheerio.load(html, { decodeEntities: true });
    if (data) data.$ = $;

    const text = publicUtils.htmlToText($);
    if (data) data.text = text;

    // Find all <a> links with href tag
    const linkUrls = [];
    $('a[href]').each((index, elem) => {
        if (elem) linkUrls.push($(elem).attr('href'));
    });

    result.emails = emailsFromUrls(linkUrls).concat(emailsFromText(text));
    result.phones = phonesFromUrls(linkUrls);
    result.phonesUncertain = phonesFromText(text);

    // Note that these regexps extract just the base profile path. For example for
    //  https://www.linkedin.com/in/carl-newman-123456a/detail/recent-activity/
    // they match just:
    //  https://www.linkedin.com/in/carl-newman-123456a
    result.linkedIns = html.match(LINKEDIN_REGEX_GLOBAL) || [];
    result.twitters = html.match(TWITTER_REGEX_GLOBAL) || [];
    result.instagrams = html.match(INSTAGRAM_REGEX_GLOBAL) || [];
    result.facebooks = html.match(FACEBOOK_REGEX_GLOBAL) || [];
    result.youtubes = html.match(YOUTUBE_REGEX_GLOBAL) || [];

    // Sort and deduplicate handles
    // eslint-disable-next-line guard-for-in, no-restricted-syntax
    for (const key in result) {
        result[key].sort();
        result[key] = _.uniq(result[key], true);
    }

    return result;
};


/**
 * A namespace that contains various utilities to help you extract social handles
 * from text, URLs and and HTML documents.
 *
 * **Example usage:**
 *
 * ```javascript
 * const Apify = require('apify');
 *
 * const emails = Apify.utils.social.emailsFromText('alice@example.com bob@example.com');
 * ```
 * @namespace social
 */
export const socialUtils = {
    emailsFromText,
    emailsFromUrls,
    phonesFromText,
    phonesFromUrls,
    parseHandlesFromHtml,

    EMAIL_REGEX,
    EMAIL_REGEX_GLOBAL,

    LINKEDIN_REGEX,
    LINKEDIN_REGEX_GLOBAL,

    INSTAGRAM_REGEX,
    INSTAGRAM_REGEX_GLOBAL,

    TWITTER_REGEX,
    TWITTER_REGEX_GLOBAL,

    FACEBOOK_REGEX,
    FACEBOOK_REGEX_GLOBAL,

    YOUTUBE_REGEX,
    YOUTUBE_REGEX_GLOBAL,
};
