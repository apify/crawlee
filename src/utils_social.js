/* eslint-disable no-continue */
import _ from 'underscore';
import htmlToText from 'html-to-text';
import cheerio from 'cheerio';

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
    '[0-9]{2,4}\\.[0-9]{2,4}\\.[0-9]{2,4}\\.[0-9]{2,6}',
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
 * @memberOf utils
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
 * @memberOf utils
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


const LINKEDIN_URL_REGEX_STRING = '(http(s)?:\\/\\/)?([a-z]+\\.)?linkedin\\.com\\/in\\/[a-zA-Z0-9\\-_%]+';
const INSTAGRAM_URL_REGEX_STRING = '(http(s)?:\\/\\)?([a-z]+\\.)?(instagram\\.com|instagr\\.am)\\/[a-z0-9_.]{2,30}';
// const INSTAGRAM_URL_REGEX_STRING = '(?:(^|[^0-9a-z]))(((http|https):\\/\\/)?((www\\.)?(?:instagram.com|instagr.am)\\/([A-Za-z0-9_.]{2,30})))';
// eslint-disable-next-line max-len, quotes
const TWITTER_URL_REGEX_STRING = `(?:(?:http|https):\\/\\/)?(?:www.)?(?:twitter.com)\\/(?!(oauth|account|tos|privacy|signup|home|hashtag|search|login|widgets|i|settings|start|share|intent|oct)([\\'\\"\\?\\.\\/]|$))([A-Za-z0-9_]{1,15})`;

// https://www.facebook.com/profile.php?id=1153222087
// https://www.facebook.com/julianwaldthaler
//

/**
 * Regular expression to exactly match a single LinkedIn profile URL.
 * It has the following form: `/^...$/i`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const LINKEDIN_URL_REGEX = new RegExp(`^${LINKEDIN_URL_REGEX_STRING}$`, 'i');

/**
 * Regular expression to find multiple LinkedIn profile URLs in a text.
 * It has the following form: `/.../ig`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const LINKEDIN_URL_REGEX_GLOBAL = new RegExp(LINKEDIN_URL_REGEX_STRING, 'ig');


/**
 * Regular expression to exactly match a single Instagram profile URL.
 * It has the following form: `/^...$/i`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const INSTAGRAM_URL_REGEX = new RegExp(`^${INSTAGRAM_URL_REGEX_STRING}$`, 'i');

/**
 * Regular expression to find multiple Instagram profile URLs in a text.
 * It has the following form: `/.../ig`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const INSTAGRAM_URL_REGEX_GLOBAL = new RegExp(INSTAGRAM_URL_REGEX_STRING, 'ig');


/**
 * Regular expression to exactly match a single Instagram profile URL.
 * It has the following form: `/^...$/i`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const TWITTER_URL_REGEX = new RegExp(`^${TWITTER_URL_REGEX_STRING}$`, 'i');

/**
 * Regular expression to find multiple Instagram profile URLs in a text.
 * It has the following form: `/.../ig`.
 * @type {RegExp}
 * @memberOf utils.social
 */
const TWITTER_URL_REGEX_GLOBAL = new RegExp(TWITTER_URL_REGEX_STRING, 'ig');


/**
 * The functions attempts to extract the following social handles from a HTML document:
 * emails, phones. Note that the function removes duplicates.
 * @param {String} html HTML document
 * @return {*} An object with social handles. It has the following strucute:
 * ```
 * {
 *   emails: String[],
 *   phones: String[],
 *   linkedInUrls: String[],
 * }
 * ```
 */
const handlesFromHtml = (html) => {
    const result = {
        emails: [],
        phones: [],
        linkedIns: [],
        twitters: [],
        instagrams: [],
    };

    if (!_.isString(html)) return result;

    // We use ignoreHref and ignoreImage options so that the text doesn't contain links,
    // since their parts can be interpreted as e.g. phone numbers.
    const text = htmlToText.fromString(html, { ignoreHref: true, ignoreImage: true }) || '';

    // TODO: Both html-to-text and cheerio use htmlparser2, the parsing could be done only once to improve performance
    const $ = cheerio.load(html, { decodeEntities: true });

    // Find all <a> links with href tag
    const linkUrls = [];
    $('a[href]').each((index, elem) => {
        if (elem) linkUrls.push($(elem).attr('href'));
    });

    // TODO: We should probably normalize all the handles to lower-case

    result.emails = emailsFromUrls(linkUrls).concat(emailsFromText(text));
    result.phones = phonesFromUrls(linkUrls).concat(phonesFromText(text));

    // Note that these regexps extract just the base profile path. For example, for URL:
    //  https://www.linkedin.com/in/carl-newman-123456a/detail/recent-activity/
    // they match just:
    //  https://www.linkedin.com/in/carl-newman-123456a
    result.linkedIns = html.match(LINKEDIN_URL_REGEX_GLOBAL) || [];
    result.twitters = html.match(TWITTER_URL_REGEX_GLOBAL) || [];
    result.instagrams = html.match(INSTAGRAM_URL_REGEX_GLOBAL) || [];
    // result.facebooks = html.match(INSTAGRAM_URL_REGEX_GLOBAL) || [];

    // Sort and deduplicate handles
    ['emails', 'phones', 'linkedIns', 'instagrams'].forEach((property) => {
        result[property].sort();
        result[property] = _.uniq(result[property], true);
    });

    return result;
};


/**
 * A namespace that contains various utilities to help you extract social handles
 * lie
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
    handlesFromHtml,

    EMAIL_REGEX,
    EMAIL_REGEX_GLOBAL,

    LINKEDIN_URL_REGEX,
    LINKEDIN_URL_REGEX_GLOBAL,

    INSTAGRAM_URL_REGEX,
    INSTAGRAM_URL_REGEX_GLOBAL,

    TWITTER_URL_REGEX,
    TWITTER_URL_REGEX_GLOBAL,
};
