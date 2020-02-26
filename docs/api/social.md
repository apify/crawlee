---
id: social
title: utils.social
---

<a name="social"></a>

A namespace that contains various utilities to help you extract social handles from text, URLs and and HTML documents.

**Example usage:**

```javascript
const Apify = require('apify');

const emails = Apify.utils.social.emailsFromText('alice@example.com bob@example.com');
```

---

<a name="linkedin_regex"></a>

## `social.LINKEDIN_REGEX`

Regular expression to exactly match a single LinkedIn profile URL. It has the following form: `/^...$/i` and matches URLs such as:

```
https://www.linkedin.com/in/alan-turing
en.linkedin.com/in/alan-turing
linkedin.com/in/alan-turing
```

The regular expression does NOT match URLs with additional subdirectories or query parameters, such as:

```
https://www.linkedin.com/in/linus-torvalds/latest-activity
```

Example usage:

```
if (Apify.utils.social.LINKEDIN_REGEX.test('https://www.linkedin.com/in/alan-turing')) {
    console.log('Match!');
}
```

---

<a name="linkedin_regex_global"></a>

## `social.LINKEDIN_REGEX_GLOBAL`

Regular expression to find multiple LinkedIn profile URLs in a text or HTML. It has the following form: `/.../ig` and matches URLs such as:

```
https://www.linkedin.com/in/alan-turing
en.linkedin.com/in/alan-turing
linkedin.com/in/alan-turing
```

If the profile URL contains subdirectories or query parameters, the regular expression extracts just the base part of the profile URL. For example,
from text such as:

```
https://www.linkedin.com/in/linus-torvalds/latest-activity
```

the expression extracts just the following base URL:

```
https://www.linkedin.com/in/linus-torvalds
```

Example usage:

```
const matches = text.match(Apify.utils.social.LINKEDIN_REGEX_GLOBAL);
if (matches) console.log(`${matches.length} LinkedIn profiles found!`);
```

---

<a name="instagram_regex"></a>

## `social.INSTAGRAM_REGEX`

Regular expression to exactly match a single Instagram profile URL. It has the following form: `/^...$/i` and matches URLs such as:

```
https://www.instagram.com/old_prague
www.instagram.com/old_prague/
instagr.am/old_prague
```

The regular expression does NOT match URLs with additional subdirectories or query parameters, such as:

```
https://www.instagram.com/cristiano/followers
```

Example usage:

```
if (Apify.utils.social.INSTAGRAM_REGEX.test('https://www.instagram.com/old_prague')) {
    console.log('Match!');
}
```

---

<a name="instagram_regex_global"></a>

## `social.INSTAGRAM_REGEX_GLOBAL`

Regular expression to find multiple Instagram profile URLs in a text or HTML. It has the following form: `/.../ig` and matches URLs such as:

```
https://www.instagram.com/old_prague
www.instagram.com/old_prague/
instagr.am/old_prague
```

If the profile URL contains subdirectories or query parameters, the regular expression extracts just the base part of the profile URL. For example,
from text such as:

```
https://www.instagram.com/cristiano/followers
```

the expression extracts just the following base URL:

```
https://www.instagram.com/cristiano
```

Example usage:

```
const matches = text.match(Apify.utils.social.INSTAGRAM_REGEX_GLOBAL);
if (matches) console.log(`${matches.length} Instagram profiles found!`);
```

---

<a name="twitter_regex"></a>

## `social.TWITTER_REGEX`

Regular expression to exactly match a single Twitter profile URL. It has the following form: `/^...$/i` and matches URLs such as:

```
https://www.twitter.com/apify
twitter.com/apify
```

The regular expression does NOT match URLs with additional subdirectories or query parameters, such as:

```
https://www.twitter.com/realdonaldtrump/following
```

Example usage:

```
if (Apify.utils.social.TWITTER_REGEX.test('https://www.twitter.com/apify')) {
    console.log('Match!');
}
```

---

<a name="twitter_regex_global"></a>

## `social.TWITTER_REGEX_GLOBAL`

Regular expression to find multiple Twitter profile URLs in a text or HTML. It has the following form: `/.../ig` and matches URLs such as:

```
https://www.twitter.com/apify
twitter.com/apify
```

If the profile URL contains subdirectories or query parameters, the regular expression extracts just the base part of the profile URL. For example,
from text such as:

```
https://www.twitter.com/realdonaldtrump/following
```

the expression extracts only the following base URL:

```
https://www.twitter.com/realdonaldtrump
```

Example usage:

```
const matches = text.match(Apify.utils.social.TWITTER_REGEX_STRING);
if (matches) console.log(`${matches.length} Twitter profiles found!`);
```

---

<a name="facebook_regex"></a>

## `social.FACEBOOK_REGEX`

Regular expression to exactly match a single Facebook profile URL. It has the following form: `/^...$/i` and matches URLs such as:

```
https://www.facebook.com/apifytech
facebook.com/apifytech
fb.com/apifytech
https://www.facebook.com/profile.php?id=123456789
```

The regular expression does NOT match URLs with additional subdirectories or query parameters, such as:

```
https://www.facebook.com/apifytech/photos
```

Example usage:

```
if (Apify.utils.social.FACEBOOK_REGEX.test('https://www.facebook.com/apifytech')) {
    console.log('Match!');
}
```

---

<a name="facebook_regex_global"></a>

## `social.FACEBOOK_REGEX_GLOBAL`

Regular expression to find multiple Facebook profile URLs in a text or HTML. It has the following form: `/.../ig` and matches URLs such as:

```
https://www.facebook.com/apifytech
facebook.com/apifytech
fb.com/apifytech
```

If the profile URL contains subdirectories or query parameters, the regular expression extracts just the base part of the profile URL. For example,
from text such as:

```
https://www.facebook.com/apifytech/photos
```

the expression extracts only the following base URL:

```
https://www.facebook.com/apifytech
```

Example usage:

```
const matches = text.match(Apify.utils.social.FACEBOOK_REGEX_GLOBAL);
if (matches) console.log(`${matches.length} Facebook profiles found!`);
```

---

<a name="youtube_regex"></a>

## `social.YOUTUBE_REGEX`

Regular expression to exactly match a single Youtube video URL. It has the following form: `/^...$/i` and matches URLs such as:

```
https://www.youtube.com/watch?v=kM7YfhfkiEE
https://youtu.be/kM7YfhfkiEE
```

Example usage:

```
if (Apify.utils.social.YOUTUBE_REGEX.test('https://www.youtube.com/watch?v=kM7YfhfkiEE')) {
    console.log('Match!');
}
```

---

<a name="youtube_regex_global"></a>

## `social.YOUTUBE_REGEX_GLOBAL`

Regular expression to find multiple Youtube video URLs in a text or HTML. It has the following form: `/.../ig` and matches URLs such as:

```
https://www.youtube.com/watch?v=kM7YfhfkiEE
https://youtu.be/kM7YfhfkiEE
```

Example usage:

```
const matches = text.match(Apify.utils.social.YOUTUBE_REGEX_GLOBAL);
if (matches) console.log(`${matches.length} Youtube videos found!`);
```

---

<a name="email_regex"></a>

## `social.EMAIL_REGEX`

Regular expression to exactly match a single email address. It has the following form: `/^...$/i`.

---

<a name="email_regex_global"></a>

## `social.EMAIL_REGEX_GLOBAL`

Regular expression to find multiple email addresses in a text. It has the following form: `/.../ig`.

---

<a name="emailsfromtext"></a>

## `social.emailsFromText(text)`

**Returns**: `Array<string>` - Array of emails addresses found. If no emails are found, the function returns an empty array.

The function extracts email addresses from a plain text. Note that the function preserves the order of emails and keep duplicates.

**Params**

-   **`text`**: `string` - Text to search in.

---

<a name="emailsfromurls"></a>

## `social.emailsFromUrls(urls)`

**Returns**: `Array<string>` - Array of emails addresses found. If no emails are found, the function returns an empty array.

The function extracts email addresses from a list of URLs. Basically it looks for all `mailto:` URLs and returns valid email addresses from them. Note
that the function preserves the order of emails and keep duplicates.

**Params**

-   **`urls`**: `Array<string>` - Array of URLs.

---

<a name="phonesfromtext"></a>

## `social.phonesFromText(text)`

**Returns**: `Array<string>` - Array of phone numbers found. If no phone numbers are found, the function returns an empty array.

The function attempts to extract phone numbers from a text. Please note that the results might not be accurate, since phone numbers appear in a large
variety of formats and conventions. If you encounter some problems, please [file an issue](https://github.com/apifytech/apify-js/issues).

**Params**

-   **`text`**: `string` - Text to search the phone numbers in.

---

<a name="phonesfromurls"></a>

## `social.phonesFromUrls(urls)`

**Returns**: `Array<string>` - Array of phone numbers found. If no phone numbers are found, the function returns an empty array.

Finds phone number links in an array of URLs and extracts the phone numbers from them. Note that the phone number links look like `tel://123456789`,
`tel:/123456789` or `tel:123456789`.

**Params**

-   **`urls`**: `Array<string>` - Array of URLs.

---

<a name="parsehandlesfromhtml"></a>

## `social.parseHandlesFromHtml(html, data)`

**Returns**: [`SocialHandles`](/docs/typedefs/social-handles) - An object with the social handles.

The function attempts to extract emails, phone numbers and social profile URLs from a HTML document, specifically LinkedIn, Twitter, Instagram and
Facebook profile URLs. The function removes duplicates from the resulting arrays and sorts the items alphabetically.

Note that the `phones` field contains phone numbers extracted from the special phone links such as `[call us](tel:+1234556789)` (see
[`social.phonesFromUrls()`](/docs/api/social#phonesfromurls)) and potentially other sources with high certainty, while `phonesUncertain` contains
phone numbers extracted from the plain text, which might be very inaccurate.

**Example usage:**

```javascript
const Apify = require('apify');

const browser = await Apify.launchPuppeteer();
const page = await browser.newPage();
await page.goto('http://www.example.com');
const html = await page.content();

const result = Apify.utils.social.parseHandlesFromHtml(html);
console.log('Social handles:');
console.dir(result);
```

**Params**

-   **`html`**: `string` - HTML text
-   **`data`**: `Object` <code> = </code> - Optional object which will receive the `text` and `$` properties that contain text content of the HTML and
    `cheerio` object, respectively. This is an optimization so that the caller doesn't need to parse the HTML document again, if needed.

---
