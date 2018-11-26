---
id: social
title: utils.social
---
<a name="social"></a>

A namespace that contains various utilities to help you extract social handles
from text, URLs and and HTML documents.

**Example usage:**

```javascript
const Apify = require('apify');

const emails = Apify.utils.social.emailsFromText('alice@example.com bob@example.com');
```


* [`social`](#social) : <code>object</code>
    * [`.EMAIL_REGEX`](#social.EMAIL_REGEX) : <code>RegExp</code>
    * [`.EMAIL_REGEX_GLOBAL`](#social.EMAIL_REGEX_GLOBAL) : <code>RegExp</code>
    * [`.LINKEDIN_REGEX`](#social.LINKEDIN_REGEX) : <code>RegExp</code>
    * [`.LINKEDIN_REGEX_GLOBAL`](#social.LINKEDIN_REGEX_GLOBAL) : <code>RegExp</code>
    * [`.INSTAGRAM_REGEX`](#social.INSTAGRAM_REGEX) : <code>RegExp</code>
    * [`.INSTAGRAM_REGEX_GLOBAL`](#social.INSTAGRAM_REGEX_GLOBAL) : <code>RegExp</code>
    * [`.TWITTER_REGEX`](#social.TWITTER_REGEX) : <code>RegExp</code>
    * [`.TWITTER_REGEX_GLOBAL`](#social.TWITTER_REGEX_GLOBAL) : <code>RegExp</code>
    * [`.FACEBOOK_REGEX`](#social.FACEBOOK_REGEX) : <code>RegExp</code>
    * [`.FACEBOOK_REGEX_GLOBAL`](#social.FACEBOOK_REGEX_GLOBAL) : <code>RegExp</code>
    * [`.emailsFromText(text)`](#social.emailsFromText) ⇒ <code>Array&lt;String&gt;</code>
    * [`.emailsFromUrls(urls)`](#social.emailsFromUrls) ⇒ <code>Array&lt;String&gt;</code>
    * [`.phonesFromText(text)`](#social.phonesFromText) ⇒ <code>Array&lt;String&gt;</code>
    * [`.phonesFromUrls(urls)`](#social.phonesFromUrls) ⇒ <code>Array&lt;String&gt;</code>

<a name="social.EMAIL_REGEX"></a>

## `social.EMAIL_REGEX` : <code>RegExp</code>
Regular expression to exactly match a single email address.
It has the following form: `/^...$/i`.

<a name="social.EMAIL_REGEX_GLOBAL"></a>

## `social.EMAIL_REGEX_GLOBAL` : <code>RegExp</code>
Regular expression to find multiple email addresses in a text.
It has the following form: `/.../ig`.

<a name="social.LINKEDIN_REGEX"></a>

## `social.LINKEDIN_REGEX` : <code>RegExp</code>
Regular expression to exactly match a single LinkedIn profile URL, without any additional
subdirectories or query parameters. The regular expression has the following form: `/^...$/i`.

Example usage:
```
TODO
```

<a name="social.LINKEDIN_REGEX_GLOBAL"></a>

## `social.LINKEDIN_REGEX_GLOBAL` : <code>RegExp</code>
Regular expression to find multiple LinkedIn profile URLs in a text.
It has the following form: `/.../ig`.

<a name="social.INSTAGRAM_REGEX"></a>

## `social.INSTAGRAM_REGEX` : <code>RegExp</code>
Regular expression to exactly match a single Instagram profile URL.
It has the following form: `/^...$/i`.

<a name="social.INSTAGRAM_REGEX_GLOBAL"></a>

## `social.INSTAGRAM_REGEX_GLOBAL` : <code>RegExp</code>
Regular expression to find multiple Instagram profile URLs in a text.
It has the following form: `/.../ig`.

<a name="social.TWITTER_REGEX"></a>

## `social.TWITTER_REGEX` : <code>RegExp</code>
Regular expression to exactly match a single Instagram profile URL.
It has the following form: `/^...$/i`.

<a name="social.TWITTER_REGEX_GLOBAL"></a>

## `social.TWITTER_REGEX_GLOBAL` : <code>RegExp</code>
Regular expression to find multiple Instagram profile URLs in a text.
It has the following form: `/.../ig`.

<a name="social.FACEBOOK_REGEX"></a>

## `social.FACEBOOK_REGEX` : <code>RegExp</code>
Regular expression to exactly match a single Facebook user profile URL.
It has the following form: `/^...$/i`.

<a name="social.FACEBOOK_REGEX_GLOBAL"></a>

## `social.FACEBOOK_REGEX_GLOBAL` : <code>RegExp</code>
Regular expression to find multiple Instagram profile URLs in a text.
It has the following form: `/.../ig`.

<a name="social.emailsFromText"></a>

## `social.emailsFromText(text)` ⇒ <code>Array&lt;String&gt;</code>
The function extracts email addresses from a plain text.
Note that the function preserves the order of emails and keep duplicates.

**Returns**: <code>Array&lt;String&gt;</code> - Array of emails addresses found.
If no emails are found, the function returns an empty array.  
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

## `social.emailsFromUrls(urls)` ⇒ <code>Array&lt;String&gt;</code>
The function extracts email addresses from a list of URLs.
Basically it looks for all `mailto:` URLs and returns valid email addresses from them.
Note that the function preserves the order of emails and keep duplicates.

**Returns**: <code>Array&lt;String&gt;</code> - Array of emails addresses found.
If no emails are found, the function returns an empty array.  
<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>urls</code></td><td><code>Array&lt;String&gt;</code></td>
</tr>
<tr>
<td colspan="3"><p>Array of URLs.</p>
</td></tr></tbody>
</table>
<a name="social.phonesFromText"></a>

## `social.phonesFromText(text)` ⇒ <code>Array&lt;String&gt;</code>
The function attempts to extract phone numbers from a text. Please note that
the results might not be accurate, since phone numbers appear in a large variety of formats and conventions.
If you encounter some problems, please [file an issue](https://github.com/apifytech/apify-js/issues).

**Returns**: <code>Array&lt;String&gt;</code> - Array of phone numbers found.
If no phone numbers are found, the function returns an empty array.  
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

## `social.phonesFromUrls(urls)` ⇒ <code>Array&lt;String&gt;</code>
Finds phone number links in an array of URLs and extracts the phone numbers from them.
Note that the phone number links look like `tel://123456789`, `tel:/123456789` or `tel:123456789`.

**Returns**: <code>Array&lt;String&gt;</code> - Array of phone numbers found.
If no phone numbers are found, the function returns an empty array.  
<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>urls</code></td><td><code>Array&lt;String&gt;</code></td>
</tr>
<tr>
<td colspan="3"><p>Array of URLs.</p>
</td></tr></tbody>
</table>
