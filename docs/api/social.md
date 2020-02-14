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

-   [`social`](#social) : `object`
    -   [`.LINKEDIN_REGEX`](#social.LINKEDIN_REGEX) : `RegExp`
    -   [`.LINKEDIN_REGEX_GLOBAL`](#social.LINKEDIN_REGEX_GLOBAL) : `RegExp`
    -   [`.INSTAGRAM_REGEX`](#social.INSTAGRAM_REGEX) : `RegExp`
    -   [`.INSTAGRAM_REGEX_GLOBAL`](#social.INSTAGRAM_REGEX_GLOBAL) : `RegExp`
    -   [`.TWITTER_REGEX`](#social.TWITTER_REGEX) : `RegExp`
    -   [`.TWITTER_REGEX_GLOBAL`](#social.TWITTER_REGEX_GLOBAL) : `RegExp`
    -   [`.FACEBOOK_REGEX`](#social.FACEBOOK_REGEX) : `RegExp`
    -   [`.FACEBOOK_REGEX_GLOBAL`](#social.FACEBOOK_REGEX_GLOBAL) : `RegExp`
    -   [`.YOUTUBE_REGEX`](#social.YOUTUBE_REGEX) : `RegExp`
    -   [`.YOUTUBE_REGEX_GLOBAL`](#social.YOUTUBE_REGEX_GLOBAL) : `RegExp`
    -   [`.EMAIL_REGEX`](#social.EMAIL_REGEX) : `RegExp`
    -   [`.EMAIL_REGEX_GLOBAL`](#social.EMAIL_REGEX_GLOBAL) : `RegExp`
    -   [`.emailsFromText(text)`](#social.emailsFromText) ⇒ `Array<String>`
    -   [`.emailsFromUrls(urls)`](#social.emailsFromUrls) ⇒ `Array<String>`
    -   [`.phonesFromText(text)`](#social.phonesFromText) ⇒ `Array<String>`
    -   [`.phonesFromUrls(urls)`](#social.phonesFromUrls) ⇒ `Array<String>`
    -   [`.parseHandlesFromHtml(html, data)`](#social.parseHandlesFromHtml) ⇒ [`SocialHandles`](../typedefs/socialhandles)

<a name="social.LINKEDIN_REGEX"></a>

## `social.LINKEDIN_REGEX` : `RegExp`

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

<a name="social.LINKEDIN_REGEX_GLOBAL"></a>

## `social.LINKEDIN_REGEX_GLOBAL` : `RegExp`

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

<a name="social.INSTAGRAM_REGEX"></a>

## `social.INSTAGRAM_REGEX` : `RegExp`

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

<a name="social.INSTAGRAM_REGEX_GLOBAL"></a>

## `social.INSTAGRAM_REGEX_GLOBAL` : `RegExp`

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

<a name="social.TWITTER_REGEX"></a>

## `social.TWITTER_REGEX` : `RegExp`

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

<a name="social.TWITTER_REGEX_GLOBAL"></a>

## `social.TWITTER_REGEX_GLOBAL` : `RegExp`

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

<a name="social.FACEBOOK_REGEX"></a>

## `social.FACEBOOK_REGEX` : `RegExp`

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

<a name="social.FACEBOOK_REGEX_GLOBAL"></a>

## `social.FACEBOOK_REGEX_GLOBAL` : `RegExp`

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

<a name="social.YOUTUBE_REGEX"></a>

## `social.YOUTUBE_REGEX` : `RegExp`

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

<a name="social.YOUTUBE_REGEX_GLOBAL"></a>

## `social.YOUTUBE_REGEX_GLOBAL` : `RegExp`

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

<a name="social.EMAIL_REGEX"></a>

## `social.EMAIL_REGEX` : `RegExp`

Regular expression to exactly match a single email address. It has the following form: `/^...$/i`.

<a name="social.EMAIL_REGEX_GLOBAL"></a>

## `social.EMAIL_REGEX_GLOBAL` : `RegExp`

Regular expression to find multiple email addresses in a text. It has the following form: `/.../ig`.

<a name="social.emailsFromText"></a>

## `social.emailsFromText(text)` ⇒ `Array<String>`

The function extracts email addresses from a plain text. Note that the function preserves the order of emails and keep duplicates.

**Returns**: `Array<String>` - Array of emails addresses found. If no emails are found, the function returns an empty array.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>text</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Text to search in.</p>
</td></tr></tbody>
</table>
<a name="social.emailsFromUrls"></a>

## `social.emailsFromUrls(urls)` ⇒ `Array<String>`

The function extracts email addresses from a list of URLs. Basically it looks for all `mailto:` URLs and returns valid email addresses from them. Note
that the function preserves the order of emails and keep duplicates.

**Returns**: `Array<String>` - Array of emails addresses found. If no emails are found, the function returns an empty array.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>urls</code></td><td><code>Array<String></code></td>
</tr>
<tr>
<td colspan="3"><p>Array of URLs.</p>
</td></tr></tbody>
</table>
<a name="social.phonesFromText"></a>

## `social.phonesFromText(text)` ⇒ `Array<String>`

The function attempts to extract phone numbers from a text. Please note that the results might not be accurate, since phone numbers appear in a large
variety of formats and conventions. If you encounter some problems, please [file an issue](https://github.com/apifytech/apify-js/issues).

**Returns**: `Array<String>` - Array of phone numbers found. If no phone numbers are found, the function returns an empty array.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>text</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Text to search the phone numbers in.</p>
</td></tr></tbody>
</table>
<a name="social.phonesFromUrls"></a>

## `social.phonesFromUrls(urls)` ⇒ `Array<String>`

Finds phone number links in an array of URLs and extracts the phone numbers from them. Note that the phone number links look like `tel://123456789`,
`tel:/123456789` or `tel:123456789`.

**Returns**: `Array<String>` - Array of phone numbers found. If no phone numbers are found, the function returns an empty array.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>urls</code></td><td><code>Array<String></code></td>
</tr>
<tr>
<td colspan="3"><p>Array of URLs.</p>
</td></tr></tbody>
</table>
<a name="social.parseHandlesFromHtml"></a>

## `social.parseHandlesFromHtml(html, data)` ⇒ [`SocialHandles`](../typedefs/socialhandles)

The function attempts to extract emails, phone numbers and social profile URLs from a HTML document, specifically LinkedIn, Twitter, Instagram and
Facebook profile URLs. The function removes duplicates from the resulting arrays and sorts the items alphabetically.

Note that the `phones` field contains phone numbers extracted from the special phone links such as `<a href="tel:+1234556789">call us</a>` (see
[`social.phonesFromUrls()`](#social.phonesFromUrls)]) and potentially other sources with high certainty, while `phonesUncertain` contains phone
numbers extracted from the plain text, which might be very inaccurate.

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

**Returns**: [`SocialHandles`](../typedefs/socialhandles) - An object with the social handles.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>html</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>HTML text</p>
</td></tr><tr>
<td><code>data</code></td><td><code>Object</code></td><td><code></code></td>
</tr>
<tr>
<td colspan="3"><p>Optional object which will receive the <code>text</code> and <code>$</code> properties
  that contain text content of the HTML and <code>cheerio</code> object, respectively. This is an optimization
  so that the caller doesn&#39;t need to parse the HTML document again, if needed.</p>
</td></tr></tbody>
</table>
