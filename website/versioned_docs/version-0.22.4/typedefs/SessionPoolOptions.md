---
id: version-0.22.4-session-pool-options
title: SessionPoolOptions
original_id: session-pool-options
---

<a name="sessionpooloptions"></a>

## Properties

### `maxPoolSize`

**Type**: `number` <code> = 1000</code>

Maximum size of the pool. Indicates how many sessions are rotated.

---

### `sessionOptions`

**Type**: [`SessionOptions`](../typedefs/session-options)

The configuration options for {Session} instances.

---

### `persistStateKeyValueStoreId`

**Type**: `string`

Name or Id of `KeyValueStore` where is the `SessionPool` state stored.

---

### `persistStateKey`

**Type**: `string` <code> = &quot;\&quot;SESSION_POOL_STATE\&quot;&quot;</code>

Session pool persists it's state under this key in Key value store.

---

### `createSessionFunction`

**Type**: [`CreateSession`](../typedefs/create-session)

Custom function that should return `Session` instance. Any error thrown from this function will terminate the process. Function receives `SessionPool`
instance as a parameter

---
