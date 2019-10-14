---
id: sessionpool
title: SessionPool
---

<a name="SessionPool"></a>

Handles the sessions rotation, creation and persistence. Creates a pool of [`Session`](session) instances, that are randomly rotated. When some
session is marked as blocked. It is removed and new one is created instead.

Session pool is by default persisted in default [`KeyValueStore`](keyvaluestore). If you want to have one pool for all runs you have to specify
`persistStateKeyValueStoreId`.

**Example usage:**

```javascript
const sessionPool = new SessionPool({
    maxPoolSize: 25,
    maxSessionAgeSecs: 10,
    maxSessionAgeSecs: 10,
    maxSessionUsageCount: 150, // for example when you know that the site blocks after 150 requests.
    persistStateKeyValueStoreId: 'my-key-value-store-for-sessions',
    persistStateKey: 'my-session-pool',
});

// Now you have to initialize the `SessionPool`.
// If you already have a persisted state in the selected `KeyValueState`.
// The Session pool is recreated, otherwise it creates a new one.
// It also attaches listener to `Apify.events` so it is persisted periodically and not after every change.
await sessionPool.initialize();

// Get random session from the pool
const session1 = await sessionPool.retrieveSession();
const session2 = await sessionPool.retrieveSession();
const session3 = await sessionPool.retrieveSession();

// Now you can mark the session either failed of successful

// Fails session -> it increases error count (soft retire)
session1.fail();

// Marks as successful.
session2.reclaim();

// Retires session -> session is removed from the pool
session3.retire();
```

-   [SessionPool](sessionpool)
    -   [`new exports.SessionPool(options)`](#new_SessionPool_new)
    -   [`.usableSessionsCount`](#SessionPool+usableSessionsCount) ⇒ `number`
    -   [`.retiredSessionsCount`](#SessionPool+retiredSessionsCount) ⇒ `number`
    -   [`.initialize()`](#SessionPool+initialize) ⇒ `Promise<void>`
    -   [`.retrieveSession()`](#SessionPool+retrieveSession) ⇒ [`Promise<Session>`](session)
    -   [`.getState()`](#SessionPool+getState) ⇒ `Object`
    -   [`.persistState()`](#SessionPool+persistState) ⇒ `Promise`

<a name="new_SessionPool_new"></a>

## `new exports.SessionPool(options)`

Session pool configuration.

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
<td><code>options.maxPoolSize</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum size of the pool.
Indicates how many sessions are rotated.</p>
</td></tr><tr>
<td><code>options.maxSessionAgeSecs</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Number of seconds after which the session is considered as expired.</p>
</td></tr><tr>
<td><code>options.maxSessionUsageCount</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of uses per session.
It useful, when you know the site rate-limits, so you can retire the session before it gets blocked and let it cool down.</p>
</td></tr><tr>
<td><code>options.persistStateKeyValueStoreId</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Name or Id of <code>KeyValueStore</code> where is the <code>SessionPool</code> state stored.</p>
</td></tr><tr>
<td><code>options.persistStateKey</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Session pool persists it&#39;s state under this key in Key value store.</p>
</td></tr><tr>
<td><code>options.createSessionFunction</code></td><td><code>function</code></td>
</tr>
<tr>
<td colspan="3"><p>Custom function that should return <code>Session</code> instance.</p>
</td></tr></tbody>
</table>
<a name="SessionPool+usableSessionsCount"></a>

## `sessionPool.usableSessionsCount` ⇒ `number`

Gets count of usable sessions in the pool.

<a name="SessionPool+retiredSessionsCount"></a>

## `sessionPool.retiredSessionsCount` ⇒ `number`

Gets count of blocked sessions in the pool.

<a name="SessionPool+initialize"></a>

## `sessionPool.initialize()` ⇒ `Promise<void>`

Starts periodic state persistence and potentially loads SessionPool state from [`KeyValueStore`](keyvaluestore). This function must be called before
you can start using the instance in a meaningful way.

<a name="SessionPool+retrieveSession"></a>

## `sessionPool.retrieveSession()` ⇒ [`Promise<Session>`](session)

Gets session. If there is space for new session, it creates and return new session. If the session pool is full, it picks a session from the pool, If
the picked session is usable it is returned, otherwise it creates and returns a new one.

<a name="SessionPool+getState"></a>

## `sessionPool.getState()` ⇒ `Object`

Returns an object representing the internal state of the `SessionPool` instance. Note that the object's fields can change in future releases.

<a name="SessionPool+persistState"></a>

## `sessionPool.persistState()` ⇒ `Promise`

Persists the current state of the `SessionPool` into the default [`KeyValueStore`](keyvaluestore). The state is persisted automatically in regular
intervals.
