---
id: version-0.22.4-system-status-options
title: SystemStatusOptions
original_id: system-status-options
---

<a name="systemstatusoptions"></a>

## Properties

### `currentHistorySecs`

**Type**: `number` <code> = 5</code>

Defines max age of snapshots used in the [`SystemStatus.getCurrentStatus()`](../api/system-status#getcurrentstatus) measurement.

---

### `maxMemoryOverloadedRatio`

**Type**: `number` <code> = 0.2</code>

Sets the maximum ratio of overloaded snapshots in a memory sample. If the sample exceeds this ratio, the system will be overloaded.

---

### `maxEventLoopOverloadedRatio`

**Type**: `number` <code> = 0.6</code>

Sets the maximum ratio of overloaded snapshots in an event loop sample. If the sample exceeds this ratio, the system will be overloaded.

---

### `maxCpuOverloadedRatio`

**Type**: `number` <code> = 0.4</code>

Sets the maximum ratio of overloaded snapshots in a CPU sample. If the sample exceeds this ratio, the system will be overloaded.

---

### `maxClientOverloadedRatio`

**Type**: `number` <code> = 0.3</code>

Sets the maximum ratio of overloaded snapshots in a Client sample. If the sample exceeds this ratio, the system will be overloaded.

---

### `snapshotter`

**Type**: [`Snapshotter`](../api/snapshotter)

The `Snapshotter` instance to be queried for `SystemStatus`.

---
