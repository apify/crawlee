---
id: session
title: Session
---

<a name="session"></a>

Sessions are used to store information such as cookies and can be used for generating fingerprints and proxy sessions. You can imagine each session as
a specific user, with its own cookies, IP (via proxy) and potentially a unique browser fingerprint. Session internal state can be enriched with custom
user data for example some authorization tokens and specific headers in general.

---

<a name="exports.session"></a>

## `new Session(options)`

Session configuration.

**Params**

-   **`options`**: [`SessionOptions`](/docs/typedefs/session-options)

---

<a name="isblocked"></a>

## `session.isBlocked()`

**Returns**: `boolean`

indicates whether the session is blocked. Session is blocked once it reaches the `maxErrorScore`.

---

<a name="isexpired"></a>

## `session.isExpired()`

**Returns**: `boolean`

Indicates whether the session is expired. Session expiration is determined by the `maxAgeSecs`. Once the session is older than
`createdAt + maxAgeSecs` the session is considered expired.

---

<a name="ismaxusagecountreached"></a>

## `session.isMaxUsageCountReached()`

**Returns**: `boolean`

Indicates whether the session is used maximum number of times. Session maximum usage count can be changed by `maxUsageCount` parameter.

---

<a name="isusable"></a>

## `session.isUsable()`

**Returns**: `boolean`

Indicates whether the session can be used for next requests. Session is usable when it is not expired, not blocked and the maximum usage count has not
be reached.

---

<a name="markgood"></a>

## `session.markGood()`

This method should be called after a successful session usage. It increases `usageCount` and potentially lowers the `errorScore` by the
`errorScoreDecrement`.

---

<a name="getstate"></a>

## `session.getState()`

**Returns**: [`SessionState`](/docs/typedefs/session-state) - represents session internal state.

Gets session state for persistence in KeyValueStore.

---

<a name="retire"></a>

## `session.retire()`

Marks session as blocked and emits event on the `SessionPool` This method should be used if the session usage was unsuccessful and you are sure that
it is because of the session configuration and not any external matters. For example when server returns 403 status code. If the session does not work
due to some external factors as server error such as 5XX you probably want to use `markBad` method.

---

<a name="markbad"></a>

## `session.markBad()`

Increases usage and error count. Should be used when the session has been used unsuccessfully. For example because of timeouts.

---

<a name="retireonblockedstatuscodes"></a>

## `session.retireOnBlockedStatusCodes(statusCode, [blockedStatusCodes])`

**Returns**: `boolean` - whether the session was retired.

With certain status codes: `401`, `403` or `429` we can be certain that the target website is blocking us. This function helps to do this conveniently
by retiring the session when such code is received. Optionally the default status codes can be extended in the second parameter.

**Params**

-   **`statusCode`**: `number` - HTTP status code
-   **`[blockedStatusCodes]`**: `Array<number>` - Custom HTTP status codes that means blocking on particular website.

---

<a name="setcookiesfromresponse"></a>

## `session.setCookiesFromResponse(response)`

Saves cookies from an HTTP response to be used with the session. It expects an object with a `headers` property that's either an `Object` (typical
Node.js responses) or a `Function` (Puppeteer Response).

It then parses and saves the cookies from the `set-cookie` header, if available.

**Params**

-   **`response`**: `Object`

---

<a name="setpuppeteercookies"></a>

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

**Params**

-   **`cookies`**: `Array<PuppeteerCookie>`
-   **`url`**: `string`

---

<a name="getpuppeteercookies"></a>

## `session.getPuppeteerCookies(url)`

**Returns**: `Array<PuppeteerCookie>`

Returns cookies in a format compatible with puppeteer and ready to be used with `page.setCookie`.

**Params**

-   **`url`**: `String` - website url. Only cookies stored for this url will be returned

---

<a name="getcookiestring"></a>

## `session.getCookieString(url)`

**Returns**: `string` - - represents `Cookie` header.

Returns cookies saved with the session in the typical key1=value1; key2=value2 format, ready to be used in a cookie header or elsewhere.

**Params**

-   **`url`**: `string`

---
