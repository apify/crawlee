---
id: version-0.22.4-session-pool
title: SessionPool
original_id: session-pool
---

<a name="sessionpool"></a>

Handles the rotation, creation and persistence of user-like sessions. Creates a pool of [`Session`](../api/session) instances, that are randomly
rotated. When some session is marked as blocked. It is removed and new one is created instead. Learn more in the
[`Session management guide`](../guides/session-management).

You can create one by calling the [`Apify.openSessionPool`](../api/apify#opensessionpool) function.

Session pool is already integrated into crawlers, and it can significantly improve your scraper performance with just 2 lines of code.

**Example usage:**

```javascript
const crawler = new Apify.CheerioCrawler({
    useSessionPool: true,
    persistCookiesPerSession: true,
    // ...
});
```

You can configure the pool with many options. See the [`SessionPoolOptions`](../typedefs/session-pool-options). Session pool is by default persisted
in default [`KeyValueStore`](../api/key-value-store). If you want to have one pool for all runs you have to specify
[`SessionPoolOptions.persistStateKeyValueStoreId`](../typedefs/session-pool-options#persiststatekeyvaluestoreid).

**Advanced usage:**

```javascript
const sessionPool = await Apify.openSessionPool({
    maxPoolSize: 25,
    sessionOptions: {
        maxAgeSecs: 10,
        maxUsageCount: 150, // for example when you know that the site blocks after 150 requests.
    },
    persistStateKeyValueStoreId: 'my-key-value-store-for-sessions',
    persistStateKey: 'my-session-pool',
});

// Get random session from the pool
const session1 = await sessionPool.getSession();
const session2 = await sessionPool.getSession();
const session3 = await sessionPool.getSession();

// Now you can mark the session either failed or successful

// Marks session as bad after unsuccessful usage -> it increases error count (soft retire)
session1.markBad();

// Marks as successful.
session2.markGood();

// Retires session -> session is removed from the pool
session3.retire();
```

---

<a name="usablesessionscount"></a>

## `sessionPool.usableSessionsCount`

Gets count of usable sessions in the pool.

**Returns**:

`number`

---

<a name="retiredsessionscount"></a>

## `sessionPool.retiredSessionsCount`

Gets count of retired sessions in the pool.

**Returns**:

`number`

---

<a name="initialize"></a>

## `sessionPool.initialize()`

Starts periodic state persistence and potentially loads SessionPool state from [`KeyValueStore`](../api/key-value-store). It is called automatically
by the [`Apify.openSessionPool`](../api/apify#opensessionpool) function.

**Returns**:

`Promise<void>`

---

<a name="getsession"></a>

## `sessionPool.getSession()`

Gets session. If there is space for new session, it creates and return new session. If the session pool is full, it picks a session from the pool, If
the picked session is usable it is returned, otherwise it creates and returns a new one.

**Returns**:

[`Promise<Session>`](../api/session)

---

<a name="getstate"></a>

## `sessionPool.getState()`

Returns an object representing the internal state of the `SessionPool` instance. Note that the object's fields can change in future releases.

---

<a name="persiststate"></a>

## `sessionPool.persistState()`

Persists the current state of the `SessionPool` into the default [`KeyValueStore`](../api/key-value-store). The state is persisted automatically in
regular intervals.

**Returns**:

`Promise<void>`

---

<a name="teardown"></a>

## `sessionPool.teardown()`

Removes listener from `persistState` event. This function should be called after you are done with using the `SessionPool` instance.

---
