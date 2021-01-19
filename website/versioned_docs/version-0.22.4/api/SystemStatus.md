---
id: version-0.22.4-system-status
title: SystemStatus
original_id: system-status
---

<a name="systemstatus"></a>

Provides a simple interface to reading system status from a [`Snapshotter`](../api/snapshotter) instance. It only exposes two functions
[`SystemStatus.getCurrentStatus()`](../api/system-status#getcurrentstatus) and
[`SystemStatus.getHistoricalStatus()`](../api/system-status#gethistoricalstatus). The system status is calculated using a weighted average of
overloaded messages in the snapshots, with the weights being the time intervals between the snapshots. Each resource is calculated separately and the
system is overloaded whenever at least one resource is overloaded. The class is used by the [`AutoscaledPool`](../api/autoscaled-pool) class.

[`SystemStatus.getCurrentStatus()`](../api/system-status#getcurrentstatus) returns a boolean that represents the current status of the system. The
length of the current timeframe in seconds is configurable by the `currentHistorySecs` option and represents the max age of snapshots to be considered
for the calculation.

[`SystemStatus.getHistoricalStatus()`](../api/system-status#gethistoricalstatus) returns a boolean that represents the long-term status of the system.
It considers the full snapshot history available in the [`Snapshotter`](../api/snapshotter) instance.

---

<a name="systemstatus"></a>

## `new SystemStatus([options])`

**Parameters**:

-   **`[options]`**: [`SystemStatusOptions`](../typedefs/system-status-options) - All `SystemStatus` configuration options.

---

<a name="getcurrentstatus"></a>

## `systemStatus.getCurrentStatus()`

Returns an [`SystemInfo`](../typedefs/system-info) object with the following structure:

```javascript
{
    isSystemIdle: Boolean,
    memInfo: Object,
    eventLoopInfo: Object,
    cpuInfo: Object
}
```

Where the `isSystemIdle` property is set to `false` if the system has been overloaded in the last `options.currentHistorySecs` seconds, and `true`
otherwise.

**Returns**:

[`SystemInfo`](../typedefs/system-info)

---

<a name="gethistoricalstatus"></a>

## `systemStatus.getHistoricalStatus()`

Returns an [`SystemInfo`](../typedefs/system-info) object with the following structure:

```javascript
{
    isSystemIdle: Boolean,
    memInfo: Object,
    eventLoopInfo: Object,
    cpuInfo: Object
}
```

Where the `isSystemIdle` property is set to `false` if the system has been overloaded in the full history of the [`Snapshotter`](../api/snapshotter)
(which is configurable in the [`Snapshotter`](../api/snapshotter)) and `true` otherwise.

**Returns**:

[`SystemInfo`](../typedefs/system-info)

---
