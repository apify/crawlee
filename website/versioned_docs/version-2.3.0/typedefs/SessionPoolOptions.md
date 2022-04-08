---
id: version-2.3.0-session-pool-options
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

The configuration options for [`Session`](../api/session) instances.

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

### `forceCloud`

**Type**: `boolean` <code> = false</code>

If set to `true` then the function uses cloud storage usage even if the `APIFY_LOCAL_STORAGE_DIR` environment variable is set. This way it is possible
to combine local and cloud storage.

**Note:** If you use `forceCloud`, it is recommended to also set the `persistStateKeyValueStoreId` option, as otherwise the `KeyValueStore` will be
unnamed!

---
