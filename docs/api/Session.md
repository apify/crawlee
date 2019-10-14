---
id: session
title: Session
---

<a name="Session"></a>

Class aggregating data for session. Sessions are used to store information such as cookies and can be used for generating fingerprints and proxy
sessions. You can think of a session as one specific user. Session internal state can be enriched with custom user data for example some authorization
tokens and specific headers in general.

-   [Session](session)
    -   [`new exports.Session(options)`](#new_Session_new)
    -   [`.isBlocked()`](#Session+isBlocked) ⇒ `boolean`
    -   [`.isExpired()`](#Session+isExpired) ⇒ `boolean`
    -   [`.isMaxUsageCountReached()`](#Session+isMaxUsageCountReached) ⇒ `boolean`
    -   [`.isUsable()`](#Session+isUsable) ⇒ `boolean`
    -   [`.reclaim()`](#Session+reclaim)
    -   [`.getState()`](#Session+getState) ⇒ `Object`
    -   [`.retire()`](#Session+retire)
    -   [`.fail()`](#Session+fail)

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
<td><code>options</code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>options.id</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Id of session used for generating fingerprints. It is used as proxy session name.</p>
</td></tr><tr>
<td><code>options.cookies</code></td><td><code>Array</code></td>
</tr>
<tr>
<td colspan="3"><p>Cookies storage per session.</p>
</td></tr><tr>
<td><code>options.maxAgeSecs</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Number of seconds after which the session is considered as expired.</p>
</td></tr><tr>
<td><code>options.userData</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Object where custom user data can be stored. For example custom headers.</p>
</td></tr><tr>
<td><code>options.maxErrorScore</code></td><td><code>number</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of failed session usage.
If the <code>errorScore</code> reaches the <code>maxErrorScore</code> session is marked as block and it is thrown away.</p>
</td></tr><tr>
<td><code>options.errorScoreDecrement</code></td><td><code>number</code></td>
</tr>
<tr>
<td colspan="3"><p>It is used for healing the session.
For example: if your session fails two times, but it is successful on the third attempt it&#39;s errorScore is decremented by this number.</p>
</td></tr><tr>
<td><code>options.createdAt</code></td><td><code>Date</code></td>
</tr>
<tr>
<td colspan="3"><p>Date of creation.</p>
</td></tr><tr>
<td><code>options.expiredAt</code></td><td><code>Date</code></td>
</tr>
<tr>
<td colspan="3"><p>Date of expiration.</p>
</td></tr><tr>
<td><code>options.usageCount</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how many times the session has been used.</p>
</td></tr><tr>
<td><code>options.errorCount</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how many times the session failed.</p>
</td></tr><tr>
<td><code>options.maxSessionUsageCount</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Session should be used only a limited amount of times.
This number indicates how many times the session is going to be used, before it is thrown away.</p>
</td></tr><tr>
<td><code>options.sessionPool</code></td><td><code>EventEmitter</code></td>
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

Indicates whether the session is used maximum number of times. Session maximum usage count can be changed by `maxSessionUsageCount` parameter.

<a name="Session+isUsable"></a>

## `session.isUsable()` ⇒ `boolean`

Indicates whether the session can be used for next requests. Session is usable when it is not expired, not blocked and the maximum usage count has not
be reached.

<a name="Session+reclaim"></a>

## `session.reclaim()`

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
due to some external factors as server error such as 5XX you probably want to use `fail` method.

<a name="Session+fail"></a>

## `session.fail()`

Increases usage and error count. Should be used when the session has been used unsuccessfully. For example because of timeouts.
