import _ from 'underscore';

// Regex inspired by https://zapier.com/blog/extract-links-email-phone-regex/
// eslint-disable-next-line max-len
const EMAIL_REGEX_STRING = '(?:[a-z0-9!#$%&\'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&\'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\\])';
const EMAIL_REGEX = new RegExp(`^${EMAIL_REGEX_STRING}$`, 'i');
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
    const emails = _.isString(text) ? text.match(EMAIL_REGEX_GLOBAL) : [];
    return emails || [];
};


/**
 * The function extracts email addresses from a list of URLs.
 * Basically it looks for all `mailto:` URLs and returns valid email addresses from them.
 * Note that the function preserves the order of emails and keep duplicates.
 * @param {String[]} Array of URLs.
 * @return {String[]} Array of emails addresses found.
 * If no emails are found, the function returns an empty array.
 * @memberOf utils.social
 */
const emailsFromUrls = (urls) => {
    if (!Array.isArray(urls)) throw new Error('The "urls" parameter must be an array');

    const emails = [];
    for (const url of urls) {
        if (url && EMAIL_URL_PREFIX_REGEX.test(url)) {
            const email = url.replace(EMAIL_URL_PREFIX_REGEX, '').trim();
            if (EMAIL_REGEX.test(email)) {
                emails.push(email);
            }
        }
    }
    return emails;
};


const LINKEDIN_URL_REGEX = /http(s)?:\/\/[a-zA-Z]+\.linkedin\.com\/in\/[a-zA-Z0-9\-_%]+/g;
const INSTAGRAM_URL_REGEX = /(?:(^|[^0-9a-z]))(((http|https):\/\/)?((www\.)?(?:instagram.com|instagr.am)\/([A-Za-z0-9_.]{2,30})))/ig;
// eslint-disable-next-line max-len, no-useless-escape
const TWITTER_URL_REGEX = /(?:(?:http|https):\/\/)?(?:www.)?(?:twitter.com)\/(?!(oauth|account|tos|privacy|signup|home|hashtag|search|login|widgets|i|settings|start|share|intent|oct)([\'\"\?\.\/]|$))([A-Za-z0-9_]{1,15})/igm;

// Supports URLs starting with `tel://`, `tel:/` and `tel:`, and similarly `phone` and `telephone`
const PHONE_URL_PREFIX_REGEX = /^(tel|phone|telephone):(\/)?(\/)?/i;

// It's pretty much impossible (and unmaintainable) to have just one large regular expression for all possible phone numbers.
// So here we define various regular expression for typical phone number patterns, which are then used to compile
// a single large regular expressions. Add more patterns as needed.
const PHONE_REGEXS_STRS = [
    // 775123456
    '[0-9]{6,15}',

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

    // 413 577 1234
    '[0-9]{2,4} [0-9]{2,4} [0-9]{2,6}',

    // 413 577 1234 564
    '[0-9]{2,4}\\.[0-9]{2,4}\\.[0-9]{2,4}\\.[0-9]{2,6}',

    // 1(413)555-2378 or 1 (413) 555-2378 or 1 (413) 555 2378 or (303) 494-2320
    '([0-9]{1,4}( )?)?\\([0-9]{2,4}\\)( )?[0-9]{2,4}(( )?-)?( )?[0-9]{2,6}',

    // TODO: (262) 955-95-79
    // TODO: skip strings that looks like dates (e.g. "2005-11-22")
];

// All phones might be prefixed with '+' or '00'
for (let i = 0; i < PHONE_REGEXS_STRS.length; i++) {
    PHONE_REGEXS_STRS[i] = `(00|\\+)?${PHONE_REGEXS_STRS[i]}`;
}

// The minimum number of digits a phone number can contain.
// That's because the PHONE_REGEXS_STRS patterns are quite wide and report a lot of false positives.
const PHONE_MIN_DIGITS = 7;

// These are patterns that might be matched by PHONE_REGEXS_STRS,
// but which are most likely not phone numbers. Add more patterns as needed.
const SKIP_PHONE_REGEXS = [
    // 2018-11-10
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}$',
];


const PHONE_REGEX_GLOBAL = new RegExp(`(${PHONE_REGEXS_STRS.join('|')})`, 'ig');
const SKIP_PHONE_REGEX = new RegExp(`^(${SKIP_PHONE_REGEXS.join('|')})$`, 'i');


/**
 * The function attempts to extract phone numbers from a text. Please note that
 * this might not be exactly accurate, since phone numbers have a variety of forms and conventions.
 * If you find some problems, please [file an issue](https://github.com/apifytech/apify-js/issues).
 * @param {String} text Text to search the phone numbers in.
 * @return {String[]} Array of phone numbers found.
 * If no phone numbers are found, the function returns an empty array.
 * @memberOf utils
 */
const phonesFromText = (text) => {
    if (!text) return [];

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
    const phones = [];
    urls.forEach((url) => {
        if (url && PHONE_URL_PREFIX_REGEX.test(url)) {
            phones.push(url.replace(PHONE_URL_PREFIX_REGEX, ''));
        }
    });

    // The phones from URLs need to pass the same criteria as phones in text
    return phonesFromText(phones.join('\n'));
};


/**
 * A namespace that contains various Puppeteer utilities.
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
};


/*
console.dir(PHONE_REGEX_GLOBAL);

const testPhones = `
775123456
+420775123456
00420775123456

413-577-1234
981-413-777-8888
413.233.2343
562-3113
401 311 7898
1 (413) 555-2378
1(413)555-2378
1 (413) 555-2378
1 (413) 555 2378

4135552375

+44 7911 123456

123-456-789
123 456 789
  123.456.789

(000)000-0000
(000)000 0000
(000)000.0000
(000) 000-0000
(000) 000 0000
(000) 000.0000

000-0000
000 0000
000.0000

0000000
0000000000
(000)0000000

`;

if (testPhones) {
    console.log('Test found phone numbers:');
    let m;
    do {
        m = PHONE_REGEX_GLOBAL.exec(testPhones);
        if (m) console.log(m[0]);
    } while (m);
}

process.exit(0);

*/
