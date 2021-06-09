---
id: version-0.22.4-statistics
title: Statistics
original_id: statistics
---

<a name="statistics"></a>

The statistics class provides an interface to collecting and logging run statistics for requests.

All statistic information is saved on key value store under the key SDK*CRAWLER_STATISTICS*\*, persists between migrations and abort/resurrect

## Properties

### `state`

**Type**: [`StatisticState`](../typedefs/statistic-state)

Current statistic state used for doing calculations on [`Statistics.calculate()`](../api/statistics#calculate) calls

---

### `id`

**Type**: `number`

Statistic instance id

---

### `requestRetryHistogram`

**Type**: `Array<number>`

Contains the current retries histogram. Index 0 means 0 retries, index 2, 2 retries, and so on

---

<a name="reset"></a>

## `statistics.reset()`

Set the current statistic instance to pristine values

---

<a name="calculate"></a>

## `statistics.calculate()`

Calculate the current statistics

---

<a name="startcapturing"></a>

## `statistics.startCapturing()`

Initializes the key value store for persisting the statistics, displaying the current state in predefined intervals

---

<a name="stopcapturing"></a>

## `statistics.stopCapturing()`

Stops logging and remove event listeners, then persist

---

<a name="persiststate"></a>

## `statistics.persistState()`

Persist internal state to the key value store

---

<a name="tojson"></a>

## `statistics.toJSON()`

Make this class serializable when called with `JSON.stringify(statsInstance)` directly or through `keyValueStore.setValue('KEY', statsInstance)`

**Returns**:

[`StatisticPersistedState`](../typedefs/statistic-persisted-state) \| [`StatisticState`](../typedefs/statistic-state)

---
