---
id: version-0.22.4-session-options
title: SessionOptions
original_id: session-options
---

<a name="sessionoptions"></a>

## Properties

### `id`

**Type**: `string`

Id of session used for generating fingerprints. It is used as proxy session name.

---

### `maxAgeSecs`

**Type**: `number` <code> = 3000</code>

Number of seconds after which the session is considered as expired.

---

### `userData`

**Type**: `object`

Object where custom user data can be stored. For example custom headers.

---

### `maxErrorScore`

**Type**: `number` <code> = 3</code>

Maximum number of marking session as blocked usage. If the `errorScore` reaches the `maxErrorScore` session is marked as block and it is thrown away.
It starts at 0. Calling the `markBad` function increases the `errorScore` by 1. Calling the `markGood` will decrease the `errorScore` by
`errorScoreDecrement`

---

### `errorScoreDecrement`

**Type**: `number` <code> = 0.5</code>

It is used for healing the session. For example: if your session is marked bad two times, but it is successful on the third attempt it's errorScore is
decremented by this number.

---

### `createdAt`

**Type**: `Date`

Date of creation.

---

### `expiresAt`

**Type**: `Date`

Date of expiration.

---

### `usageCount`

**Type**: `number` <code> = 0</code>

Indicates how many times the session has been used.

---

### `errorCount`

**Type**: `number` <code> = 0</code>

Indicates how many times the session is marked bad.

---

### `maxUsageCount`

**Type**: `number` <code> = 50</code>

Session should be used only a limited amount of times. This number indicates how many times the session is going to be used, before it is thrown away.

---

### `sessionPool`

**Type**: [`SessionPool`](../api/session-pool)

SessionPool instance. Session will emit the `sessionRetired` event on this instance.

---
