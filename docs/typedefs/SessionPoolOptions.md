---
id: session-pool-options
title: SessionPoolOptions
---

<a name="sessionpooloptions"></a>

## Properties

### `maxPoolSize`

**Type**: `Number` <code> = 1000</code>

Maximum size of the pool. Indicates how many sessions are rotated.

---

### `sessionOptions`

**Type**: [`SessionOptions`](/docs/typedefs/session-options)

The configuration options for {Session} instances.

---

### `persistStateKeyValueStoreId`

**Type**: `String`

Name or Id of `KeyValueStore` where is the `SessionPool` state stored.

---

### `persistStateKey`

**Type**: `String` <code> = &quot;SESSION_POOL_STATE&quot;</code>

Session pool persists it's state under this key in Key value store.

---

### `createSessionFunction`

**Type**: [`CreateSession`](/docs/typedefs/create-session)

Custom function that should return `Session` instance. Function receives `SessionPool` instance as a parameter

---
