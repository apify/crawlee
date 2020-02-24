---
id: session-pool
title: SessionPool
---

<a name="sessionpool"></a>

Handles the sessions rotation, creation and persistence. Creates a pool of [`Session`](/docs/api/session) instances, that are randomly rotated. When
some session is marked as blocked. It is removed and new one is created instead. Learn more in the
[`Session management guide`](/docs/guides/session-management).

Session pool is by default persisted in default [`KeyValueStore`](/docs/api/key-value-store). If you want to have one pool for all runs you have to
specify [`SessionPoolOptions.persistStateKeyValueStoreId`](/docs/typedefs/session-pool-options#persiststatekeyvaluestoreid).

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

---

<a name="exports.sessionpool"></a>

## `new SessionPool([options])`

Session pool configuration.

**Params**

-   **`[options]`**: [`SessionPoolOptions`](/docs/typedefs/session-pool-options) - All `SessionPool` configuration options.

---

<a name="usablesessionscount"></a>

## `sessionPool.usableSessionsCount`

**Returns**: `number`

Gets count of usable sessions in the pool.

---

<a name="retiredsessionscount"></a>

## `sessionPool.retiredSessionsCount`

**Returns**: `number`

Gets count of retired sessions in the pool.

---

<a name="initialize"></a>

## `sessionPool.initialize()`

**Returns**: `Promise<void>`

Starts periodic state persistence and potentially loads SessionPool state from [`KeyValueStore`](/docs/api/key-value-store). This function must be
called before you can start using the instance in a meaningful way.

---

<a name="getsession"></a>

## `sessionPool.getSession()`

**Returns**: [`Promise<Session>`](/docs/api/session)

Gets session. If there is space for new session, it creates and return new session. If the session pool is full, it picks a session from the pool, If
the picked session is usable it is returned, otherwise it creates and returns a new one.

---

<a name="getstate"></a>

## `sessionPool.getState()`

**Returns**: `Object`

Returns an object representing the internal state of the `SessionPool` instance. Note that the object's fields can change in future releases.

---

<a name="persiststate"></a>

## `sessionPool.persistState()`

**Returns**: `Promise`

Persists the current state of the `SessionPool` into the default [`KeyValueStore`](/docs/api/key-value-store). The state is persisted automatically in
regular intervals.

---

<a name="teardown"></a>

## `sessionPool.teardown()`

Removes listener from `persistState` event. This function should be called after you are done with using the `SessionPool` instance.

---
