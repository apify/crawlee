---
id: session
title: Session
---

<a name="Session"></a>

Sessions are used to store information such as cookies and can be used for generating fingerprints and proxy sessions. You can imagine each session as
a specific user, with its own cookies, IP (via proxy) and potentially a unique browser fingerprint. Session internal state can be enriched with custom
user data for example some authorization tokens and specific headers in general.

-   [Session](session)
    -   [`new exports.Session(options)`](#new_Session_new)
    -   [`.isBlocked()`](#Session+isBlocked) ⇒ `boolean`
    -   [`.isExpired()`](#Session+isExpired) ⇒ `boolean`
    -   [`.isMaxUsageCountReached()`](#Session+isMaxUsageCountReached) ⇒ `boolean`
    -   [`.isUsable()`](#Session+isUsable) ⇒ `boolean`
    -   [`.markGood()`](#Session+markGood)
    -   [`.getState()`](#Session+getState) ⇒ [`SessionState`](../typedefs/sessionstate)
    -   [`.retire()`](#Session+retire)
    -   [`.markBad()`](#Session+markBad)
    -   [`.retireOnBlockedStatusCodes(statusCode, [blockedStatusCodes])`](#Session+retireOnBlockedStatusCodes) ⇒ `boolean`
    -   [`.setCookiesFromResponse(response)`](#Session+setCookiesFromResponse)
    -   [`.setPuppeteerCookies(cookies, url)`](#Session+setPuppeteerCookies)
    -   [`.getPuppeteerCookies(url)`](#Session+getPuppeteerCookies) ⇒ `Array<PuppeteerCookie>`
    -   [`.getCookieString(url)`](#Session+getCookieString) ⇒ `string`

<a name="new_Session_new"></a>

## `new exports.Session(options)`

Session configuration.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options</code></td><td><code><a href="../typedefs/sessionoptions">SessionOptions</a></code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="Session+isBlocked"></a>

## `session.isBlocked()` ⇒ `boolean`

indicates whether the session is blocked. Session is blocked once it reaches the `maxErrorScore`.

<a name="Session+isExpired"></a>

## `session.isExpired()` ⇒ `boolean`

Indicates whether the session is expired. Session expiration is determined by the `maxAgeSecs`. Once the session is older than
`createdAt + maxAgeSecs` the session is considered expired.

<a name="Session+isMaxUsageCountReached"></a>

## `session.isMaxUsageCountReached()` ⇒ `boolean`

Indicates whether the session is used maximum number of times. Session maximum usage count can be changed by `maxUsageCount` parameter.

<a name="Session+isUsable"></a>

## `session.isUsable()` ⇒ `boolean`

Indicates whether the session can be used for next requests. Session is usable when it is not expired, not blocked and the maximum usage count has not
be reached.

<a name="Session+markGood"></a>

## `session.markGood()`

This method should be called after a successful session usage. It increases `usageCount` and potentially lowers the `errorScore` by the
`errorScoreDecrement`.

<a name="Session+getState"></a>

## `session.getState()` ⇒ [`SessionState`](../typedefs/sessionstate)

Gets session state for persistence in KeyValueStore.

**Returns**: [`SessionState`](../typedefs/sessionstate) - represents session internal state.  
<a name="Session+retire"></a>

## `session.retire()`

Marks session as blocked and emits event on the `SessionPool` This method should be used if the session usage was unsuccessful and you are sure that
it is because of the session configuration and not any external matters. For example when server returns 403 status code. If the session does not work
due to some external factors as server error such as 5XX you probably want to use `markBad` method.

<a name="Session+markBad"></a>

## `session.markBad()`

Increases usage and error count. Should be used when the session has been used unsuccessfully. For example because of timeouts.

<a name="Session+retireOnBlockedStatusCodes"></a>

## `session.retireOnBlockedStatusCodes(statusCode, [blockedStatusCodes])` ⇒ `boolean`

With certain status codes: `401`, `403` or `429` we can be certain that the target website is blocking us. This function helps to do this conveniently
by retiring the session when such code is received. Optionally the default status codes can be extended in the second parameter.

**Returns**: `boolean` - whether the session was retired.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>statusCode</code></td><td><code>number</code></td>
</tr>
<tr>
<td colspan="3"><p>HTTP status code</p>
</td></tr><tr>
<td><code>[blockedStatusCodes]</code></td><td><code>Array<number></code></td>
</tr>
<tr>
<td colspan="3"><p>Custom HTTP status codes that means blocking on particular website.</p>
</td></tr></tbody>
</table>
<a name="Session+setCookiesFromResponse"></a>

## `session.setCookiesFromResponse(response)`

Saves cookies from an HTTP response to be used with the session. It expects an object with a `headers` property that's either an `Object` (typical
Node.js responses) or a `Function` (Puppeteer Response).

It then parses and saves the cookies from the `set-cookie` header, if available.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>response</code></td><td><code>Object</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="Session+setPuppeteerCookies"></a>

## `session.setPuppeteerCookies(cookies, url)`

Saves an array with cookie objects to be used with the session. The objects should be in the format that
[Puppeteer uses](https://pptr.dev/#?product=Puppeteer&version=v2.0.0&show=api-pagecookiesurls), but you can also use this function to set cookies
manually:

```
[
  { name: 'cookie1', value: 'my-cookie' },
  { name: 'cookie2', value: 'your-cookie' }
]
```

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>cookies</code></td><td><code>Array<PuppeteerCookie></code></td>
</tr>
<tr>
</tr><tr>
<td><code>url</code></td><td><code>string</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="Session+getPuppeteerCookies"></a>

## `session.getPuppeteerCookies(url)` ⇒ `Array<PuppeteerCookie>`

Returns cookies in a format compatible with puppeteer and ready to be used with `page.setCookie`.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>url</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>website url. Only cookies stored for this url will be returned</p>
</td></tr></tbody>
</table>
<a name="Session+getCookieString"></a>

## `session.getCookieString(url)` ⇒ `string`

Returns cookies saved with the session in the typical key1=value1; key2=value2 format, ready to be used in a cookie header or elsewhere.

**Returns**: `string` - - represents `Cookie` header.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>url</code></td><td><code>string</code></td>
</tr>
<tr>
</tr></tbody>
</table>
