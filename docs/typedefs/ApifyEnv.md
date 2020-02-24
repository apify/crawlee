---
id: apify-env
title: ApifyEnv
---

<a name="apifyenv"></a>

Parsed representation of the `APIFY_XXX` environmental variables.

## Properties

### `actorId`

**Type**: `String` | `null`

ID of the actor (APIFY_ACTOR_ID)

---

### `actorRunId`

**Type**: `String` | `null`

ID of the actor run (APIFY_ACTOR_RUN_ID)

---

### `actorTaskId`

**Type**: `String` | `null`

ID of the actor task (APIFY_ACTOR_TASK_ID)

---

### `userId`

**Type**: `String` | `null`

ID of the user who started the actor - note that it might be different than the owner ofthe actor (APIFY_USER_ID)

---

### `token`

**Type**: `String` | `null`

Authentication token representing privileges given to the actor run, it can be passed to various Apify APIs (APIFY_TOKEN)

---

### `startedAt`

**Type**: `Date` | `null`

Date when the actor was started (APIFY_STARTED_AT)

---

### `timeoutAt`

**Type**: `Date` | `null`

Date when the actor will time out (APIFY_TIMEOUT_AT)

---

### `defaultKeyValueStoreId`

**Type**: `String` | `null`

ID of the key-value store where input and output data of this actor is stored (APIFY_DEFAULT_KEY_VALUE_STORE_ID)

---

### `defaultDatasetId`

**Type**: `String` | `null`

ID of the dataset where input and output data of this actor is stored (APIFY_DEFAULT_DATASET_ID)

---

### `memoryMbytes`

**Type**: `Number` | `null`

Amount of memory allocated for the actor, in megabytes (APIFY_MEMORY_MBYTES)

---
