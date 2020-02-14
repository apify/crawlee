---
id: sessionpool
title: SessionPool
---

<a name="SessionPool"></a>

Handles the sessions rotation, creation and persistence. Creates a pool of [`Session`](session) instances, that are randomly rotated. When some
session is marked as blocked. It is removed and new one is created instead. Learn more in the
[`Session management guide`](../guides/sessionmanagement).

Session pool is by default persisted in default [`KeyValueStore`](keyvaluestore). If you want to have one pool for all runs you have to specify
`persistStateKeyValueStoreId`.

**Example usage:**

```javascript
const sessionPool = new SessionPool({
    maxPoolSize: 25,
    sessionOptions: {
        maxAgeSecs: 10,
        maxUsageCount: 150, // for example when you know that the site blocks after 150 requests.
    },
    persistStateKeyValueStoreId: 'my-key-value-store-for-sessions',
    persistStateKey: 'my-session-pool',
});

// Now you have to initialize the `SessionPool`.
// If you already have a persisted state in the selected `KeyValueState`.
// The Session pool is recreated, otherwise it creates a new one.
// It also attaches listener to `Apify.events` so it is persisted periodically and not after every change.
await sessionPool.initialize();

// Get random session from the pool
const session1 = await sessionPool.getSession();
const session2 = await sessionPool.getSession();
const session3 = await sessionPool.getSession();

// Now you can mark the session either failed of successful

// Marks session as bad after unsuccessful usage -> it increases error count (soft retire)
session1.markBad();

// Marks as successful.
session2.markGood();

// Retires session -> session is removed from the pool
session3.retire();
```

-   [SessionPool](sessionpool)
    -   [`new exports.SessionPool([options])`](#new_SessionPool_new)
    -   [`.usableSessionsCount`](#SessionPool+usableSessionsCount) ⇒ `number`
    -   [`.retiredSessionsCount`](#SessionPool+retiredSessionsCount) ⇒ `number`
    -   [`.initialize()`](#SessionPool+initialize) ⇒ `Promise<void>`
    -   [`.getSession()`](#SessionPool+getSession) ⇒ [`Promise<Session>`](session)
    -   [`.getState()`](#SessionPool+getState) ⇒ `Object`
    -   [`.persistState()`](#SessionPool+persistState) ⇒ `Promise`
    -   [`.teardown()`](#SessionPool+teardown)

<a name="new_SessionPool_new"></a>

## `new exports.SessionPool([options])`

Session pool configuration.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[options]</code></td><td><code><a href="../typedefs/sessionpooloptions">SessionPoolOptions</a></code></td>
</tr>
<tr>
<td colspan="3"><p>All <code>SessionPool</code> configuration options.</p>
</td></tr></tbody>
</table>
<a name="SessionPool+usableSessionsCount"></a>

## `sessionPool.usableSessionsCount` ⇒ `number`

Gets count of usable sessions in the pool.

<a name="SessionPool+retiredSessionsCount"></a>

## `sessionPool.retiredSessionsCount` ⇒ `number`

Gets count of retired sessions in the pool.

<a name="SessionPool+initialize"></a>

## `sessionPool.initialize()` ⇒ `Promise<void>`

Starts periodic state persistence and potentially loads SessionPool state from [`KeyValueStore`](keyvaluestore). This function must be called before
you can start using the instance in a meaningful way.

<a name="SessionPool+getSession"></a>

## `sessionPool.getSession()` ⇒ [`Promise<Session>`](session)

Gets session. If there is space for new session, it creates and return new session. If the session pool is full, it picks a session from the pool, If
the picked session is usable it is returned, otherwise it creates and returns a new one.

<a name="SessionPool+getState"></a>

## `sessionPool.getState()` ⇒ `Object`

Returns an object representing the internal state of the `SessionPool` instance. Note that the object's fields can change in future releases.

<a name="SessionPool+persistState"></a>

## `sessionPool.persistState()` ⇒ `Promise`

Persists the current state of the `SessionPool` into the default [`KeyValueStore`](keyvaluestore). The state is persisted automatically in regular
intervals.

<a name="SessionPool+teardown"></a>

## `sessionPool.teardown()`

Removes listener from `persistState` event. This function should be called after you are done with using the `SessionPool` instance.
