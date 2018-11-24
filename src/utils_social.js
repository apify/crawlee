/* eslint-disable no-continue */
import _ from 'underscore';
import htmlToText from 'html-to-text';
import cheerio from 'cheerio';

// TODO: Finish docs and examples !!!

// Regex inspired by https://zapier.com/blog/extract-links-email-phone-regex/
// eslint-disable-next-line max-len
const EMAIL_REGEX_STRING = '(?:[a-z0-9!#$%&\'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&\'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\\])';

/**
 * Regular expression to exactly match a single email address.
 * It has the following form: `/^...$/i`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const EMAIL_REGEX = new RegExp(`^${EMAIL_REGEX_STRING}$`, 'i');

/**
 * Regular expression to find multiple email addresses in a text.
 * It has the following form: `/.../ig`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const EMAIL_REGEX_GLOBAL = new RegExp(EMAIL_REGEX_STRING, 'ig');


const EMAIL_URL_PREFIX_REGEX = /^mailto:/i;


/**
 * The function extracts email addresses from a plain text.
 * Note that the function preserves the order of emails and keep duplicates.
 * @param {String} text Text to search in.
 * @return {String[]} Array of emails addresses found.
 * If no emails are found, the function returns an empty array.
 * @memberOf utils.social
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
 * @memberOf utils.social
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


// Supports URLs starting with `tel://`, `tel:/` and `tel:`, and similarly `phone` and `telephone`
const PHONE_URL_PREFIX_REGEX = /^(tel|phone|telephone):(\/)?(\/)?/i;

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
 * @memberOf utils.social
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
 * @memberOf utils.social
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

// eslint-disable-next-line max-len
const INSTAGRAM_REGEX_STRING = '(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:(?:www\\.)?(?:instagram\\.com|instagr\\.am)\\/)([a-z0-9_.]{2,30})(?![a-z0-9_.])(?:/)?';

const TWITTER_RESERVED_PATHS = 'oauth|account|tos|privacy|signup|home|hashtag|search|login|widgets|i|settings|start|share|intent|oct';
// eslint-disable-next-line max-len, quotes
const TWITTER_REGEX_STRING = `(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:www.)?(?:twitter.com)\\/(?!(?:${TWITTER_RESERVED_PATHS})(?:[\\'\\"\\?\\.\\/]|$))([a-z0-9_]{1,15})(?![a-z0-9_])(?:/)?`;

// eslint-disable-next-line max-len, quotes
const FACEBOOK_RESERVED_PATHS = 'rsrc\\.php|apps|groups|events|l\\.php|friends|images|photo.php|chat|ajax|dyi|common|policies|login|recover|reg|help|security|messages|marketplace|pages|live|bookmarks|games|fundraisers|saved|gaming|salesgroups|jobs|people|ads|ad_campaign|weather|offers|recommendations|crisisresponse|onthisday|developers|settings';
// eslint-disable-next-line max-len, quotes
const FACEBOOK_REGEX_STRING = `(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:www.)?(?:facebook.com|fb.com)\\/(?!(?:${FACEBOOK_RESERVED_PATHS})(?:[\\'\\"\\?\\.\\/]|$))(profile\\.php\\?id\\=[0-9]{3,20}|(?!profile\\.php)[a-z0-9\\.]{5,51})(?![a-z0-9\\.])(?:/)?`;


/**
 * Regular expression to exactly match a single LinkedIn profile URL, without any additional
 * subdirectories or query parameters. The regular expression has the following form: `/^...$/i`.
 *
 * Example usage:
 * ```
 * TODO
 * ```
 * @type {RegExp}
 * @memberOf utils.social
 */
const LINKEDIN_REGEX = new RegExp(`^${LINKEDIN_REGEX_STRING}$`, 'i');

/**
 * Regular expression to find multiple LinkedIn profile URLs in a text.
 * It has the following form: `/.../ig`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const LINKEDIN_REGEX_GLOBAL = new RegExp(LINKEDIN_REGEX_STRING, 'ig');


/**
 * Regular expression to exactly match a single Instagram profile URL.
 * It has the following form: `/^...$/i`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const INSTAGRAM_REGEX = new RegExp(`^${INSTAGRAM_REGEX_STRING}$`, 'i');

/**
 * Regular expression to find multiple Instagram profile URLs in a text.
 * It has the following form: `/.../ig`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const INSTAGRAM_REGEX_GLOBAL = new RegExp(INSTAGRAM_REGEX_STRING, 'ig');


/**
 * Regular expression to exactly match a single Instagram profile URL.
 * It has the following form: `/^...$/i`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const TWITTER_REGEX = new RegExp(`^${TWITTER_REGEX_STRING}$`, 'i');

/**
 * Regular expression to find multiple Instagram profile URLs in a text.
 * It has the following form: `/.../ig`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const TWITTER_REGEX_GLOBAL = new RegExp(TWITTER_REGEX_STRING, 'ig');

/**
 * Regular expression to exactly match a single Facebook user profile URL.
 * It has the following form: `/^...$/i`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const FACEBOOK_REGEX = new RegExp(`^${FACEBOOK_REGEX_STRING}$`, 'i');

/**
 * Regular expression to find multiple Instagram profile URLs in a text.
 * It has the following form: `/.../ig`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const FACEBOOK_REGEX_GLOBAL = new RegExp(FACEBOOK_REGEX_STRING, 'ig');


/**
 * The functions attempts to extract emails, phones and social profile URLs from a HTML document,
 * specifically LinkedIn, Twitter, Instagram and Facebook profile URLs.
 * The function removes duplicates from the resulting arrays and sorts the items alphabetically.
 * @param {String} html HTML text
 * @param {Object} data Optional object which will receive the `text` and `$` properties
 *   that contain text content of the HTML and `cheerio` object, respectively. This is an optimization
 *   so that the caller doesn't need to parse the HTML document again, if needed.
 * @return {*} An object with social handles. It has the following structure:
 * ```
 * {
 *   emails: String[],
 *   phones: String[],
 *   linkedIns: String[],
 *   twitters: String[],
 *   instagrams: String[],
 *   facebooks: String[],
 * }
 * ```
 */
const parseHandlesFromHtml = (html, data = null) => {
    const result = {
        emails: [],
        phones: [],
        linkedIns: [],
        twitters: [],
        instagrams: [],
        facebooks: [],
    };

    if (!_.isString(html)) return result;

    // We use ignoreHref and ignoreImage options so that the text doesn't contain links,
    // since their parts can be interpreted as e.g. phone numbers.
    const text = htmlToText.fromString(html, { ignoreHref: true, ignoreImage: true }) || '';
    if (data) data.text = text;

    // TODO: Both html-to-text and cheerio use htmlparser2, the parsing could be done only once to improve performance
    const $ = cheerio.load(html, { decodeEntities: true });
    if (data) data.$ = $;

    // Find all <a> links with href tag
    const linkUrls = [];
    $('a[href]').each((index, elem) => {
        if (elem) linkUrls.push($(elem).attr('href'));
    });

    result.emails = emailsFromUrls(linkUrls).concat(emailsFromText(text));
    result.phones = phonesFromUrls(linkUrls).concat(phonesFromText(text));

    // Note that these regexps extract just the base profile path. For example for
    //  https://www.linkedin.com/in/carl-newman-123456a/detail/recent-activity/
    // they match just:
    //  https://www.linkedin.com/in/carl-newman-123456a
    result.linkedIns = html.match(LINKEDIN_REGEX_GLOBAL) || [];
    result.twitters = html.match(TWITTER_REGEX_GLOBAL) || [];
    result.instagrams = html.match(INSTAGRAM_REGEX_GLOBAL) || [];
    result.facebooks = html.match(FACEBOOK_REGEX_GLOBAL) || [];

    // Sort and deduplicate handles
    // eslint-disable-next-line guard-for-in, no-restricted-syntax
    for (const key in result) {
        result[key].sort();
        result[key] = _.uniq(result[key], true);
    }

    return result;
};

// TODO: Add nice example of parseHandlesFromHtml() and regular

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
};
