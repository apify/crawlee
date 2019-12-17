---
id: session
title: Session
---

<a name="Session"></a>

Class aggregating data for session. Sessions are used to store information such as cookies and can be used for generating fingerprints and proxy
sessions. You can imagine each session as a specific user, with its own cookies, IP (via proxy) and potentially a unique browser fingerprint. Session
internal state can be enriched with custom user data for example some authorization tokens and specific headers in general.

-   [Session](session)
    -   [`new exports.Session()`](#new_Session_new)
    -   [`.isBlocked()`](#Session+isBlocked) ⇒ `boolean`
    -   [`.isExpired()`](#Session+isExpired) ⇒ `boolean`
    -   [`.isMaxUsageCountReached()`](#Session+isMaxUsageCountReached) ⇒ `boolean`
    -   [`.isUsable()`](#Session+isUsable) ⇒ `boolean`
    -   [`.markGood()`](#Session+markGood)
    -   [`.getState()`](#Session+getState) ⇒ `Object`
    -   [`.retire()`](#Session+retire)
    -   [`.markBad()`](#Session+markBad)
    -   [`.checkStatus(statusCode)`](#Session+checkStatus) ⇒ `boolean`
    -   [`.putResponse(response)`](#Session+putResponse)
    -   [`.putPuppeteerCookies(puppeteerCookies, url)`](#Session+putPuppeteerCookies)
    -   [`.setCookies(cookies, url)`](#Session+setCookies)
    -   [`.getCookies(url)`](#Session+getCookies) ⇒ `Array<Object>`
    -   [`.getCookieString(url)`](#Session+getCookieString) ⇒ `String`
    -   [`.getPuppeteerCookies(url)`](#Session+getPuppeteerCookies) ⇒ `*`

<a name="new_Session_new"></a>

## `new exports.Session()`

Session configuration.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[options.id]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Id of session used for generating fingerprints. It is used as proxy session name.</p>
</td></tr><tr>
<td><code>[options.maxAgeSecs]</code></td><td><code>Number</code></td><td><code>3000</code></td>
</tr>
<tr>
<td colspan="3"><p>Number of seconds after which the session is considered as expired.</p>
</td></tr><tr>
<td><code>options.userData</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Object where custom user data can be stored. For example custom headers.</p>
</td></tr><tr>
<td><code>[options.maxErrorScore]</code></td><td><code>number</code></td><td><code>3</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of marking session as blocked usage.
If the <code>errorScore</code> reaches the <code>maxErrorScore</code> session is marked as block and it is thrown away.
It starts at 0. Calling the <code>markBad</code> function increases the <code>errorScore</code> by 1.
Calling the <code>markGood</code> will decrease the <code>errorScore</code> by <code>errorScoreDecrement</code></p>
</td></tr><tr>
<td><code>[options.errorScoreDecrement]</code></td><td><code>number</code></td><td><code>0.5</code></td>
</tr>
<tr>
<td colspan="3"><p>It is used for healing the session.
For example: if your session is marked bad two times, but it is successful on the third attempt it&#39;s errorScore is decremented by this number.</p>
</td></tr><tr>
<td><code>options.createdAt</code></td><td><code>Date</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Date of creation.</p>
</td></tr><tr>
<td><code>options.expiredAt</code></td><td><code>Date</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Date of expiration.</p>
</td></tr><tr>
<td><code>[options.usageCount]</code></td><td><code>Number</code></td><td><code>0</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how many times the session has been used.</p>
</td></tr><tr>
<td><code>[options.errorCount]</code></td><td><code>Number</code></td><td><code>0</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how many times the session is marked bad.</p>
</td></tr><tr>
<td><code>[options.maxUsageCount]</code></td><td><code>Number</code></td><td><code>50</code></td>
</tr>
<tr>
<td colspan="3"><p>Session should be used only a limited amount of times.
This number indicates how many times the session is going to be used, before it is thrown away.</p>
</td></tr><tr>
<td><code>options.sessionPool</code></td><td><code>EventEmitter</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>SessionPool instance. Session will emit the <code>sessionRetired</code> event on this instance.</p>
</td></tr></tbody>
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

## `session.getState()` ⇒ `Object`

Gets session state for persistence in KeyValueStore.

**Returns**: `Object` - represents session internal state.  
<a name="Session+retire"></a>

## `session.retire()`

Marks session as blocked and emits event on the `SessionPool` This method should be used if the session usage was unsuccessful and you are sure that
it is because of the session configuration and not any external matters. For example when server returns 403 status code. If the session does not work
due to some external factors as server error such as 5XX you probably want to use `markBad` method.

<a name="Session+markBad"></a>

## `session.markBad()`

Increases usage and error count. Should be used when the session has been used unsuccessfully. For example because of timeouts.

<a name="Session+checkStatus"></a>

## `session.checkStatus(statusCode)` ⇒ `boolean`

Retires session based on status code.

**Returns**: `boolean` - whether the session was retired.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>statusCode</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>HTTP status code</p>
</td></tr></tbody>
</table>
<a name="Session+putResponse"></a>

## `session.putResponse(response)`

Sets cookies from response to the cookieJar. Parses cookies from `set-cookie` header and sets them to `Session.cookieJar`.

<table>
<thead>
<tr>
<th>Param</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>response</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="Session+putPuppeteerCookies"></a>

## `session.putPuppeteerCookies(puppeteerCookies, url)`

Persists puppeteer cookies to session for reuse.

<table>
<thead>
<tr>
<th>Param</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>puppeteerCookies</code></td>
</tr>
<tr>
<td colspan="3"><p>cookie from puppeteer <code>page.cookies</code> method.</p>
</td></tr><tr>
<td><code>url</code></td>
</tr>
<tr>
<td colspan="3"><p>Loaded url from page function.</p>
</td></tr></tbody>
</table>
<a name="Session+setCookies"></a>

## `session.setCookies(cookies, url)`

Set cookies to session cookieJar. Cookies array should be compatible with tough-cookie.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>cookies</code></td><td><code>Array<Cookie></code></td>
</tr>
<tr>
</tr><tr>
<td><code>url</code></td><td><code>String</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="Session+getCookies"></a>

## `session.getCookies(url)` ⇒ `Array<Object>`

Get cookies. Gets a array of `tough-cookie` Cookie instances.

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
</tr></tbody>
</table>
<a name="Session+getCookieString"></a>

## `session.getCookieString(url)` ⇒ `String`

Wrapper around `tough-cookie` Cookie jar `getCookieString` method.

**Returns**: `String` - - represents `Cookie` header.

<table>
<thead>
<tr>
<th>Param</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>url</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="Session+getPuppeteerCookies"></a>

## `session.getPuppeteerCookies(url)` ⇒ `*`

Gets cookies in format ready for puppeteer.

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
</tr></tbody>
</table>
