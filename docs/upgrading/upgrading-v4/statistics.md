---
id: statistics
title: 'Upgrading to v4: crawler statistics'
sidebar_label: Crawler statistics
sidebar_position: 4
slug: /upgrading/upgrading-to-v4/statistics
---

Applies when you passed `statisticsOptions` to a crawler, subclassed `Statistics`, or passed type arguments to `BrowserCrawler`/`BrowserCrawlerOptions`. This page is part of the [Upgrading to v4](./upgrading-v4.md) guide.

## `statisticsOptions` is replaced by a `statistics` instance

The `statisticsOptions` option has been removed from the crawler constructor. Instead of passing options for the crawler to build its `Statistics` from, construct a `Statistics` instance yourself and pass it via the new `statistics` option — the same inject-or-default idiom as `sessionPool` and `browserPool`.

```typescript
import { Statistics } from '@crawlee/basic';

const crawler = new BasicCrawler({
    // The old parameter won't work anymore
    // statisticsOptions: { saveErrorSnapshots: true },
    statistics: new Statistics({ saveErrorSnapshots: true }),
});
```

Omit the option and the crawler builds its own default, exactly as before. A supplied instance is treated as borrowed: the crawler records into it and drives its capture lifecycle for the run, but never `reset()`s it between `run()` calls — so a preconfigured instance keeps whatever state it was handed.

The option accepts the built-in `Statistics` or any object implementing the new `IStatistics` interface, so a fully custom statistics backend can be plugged in without subclassing. The crawler exposes it as `crawler.statistics` (renamed from `crawler.stats`) typed as `IStatistics`.

## The request-recording methods are renamed

A crawler processes requests, not jobs, so the four methods `IStatistics` exposes for recording them dropped the borrowed vocabulary. Signatures are unchanged, so a custom implementation only needs renaming:

- `startJob()` -> `recordRequestStart()`
- `finishJob()` -> `recordRequestSuccess()`
- `failJob()` -> `recordRequestFailure()`
- `discardJob()` -> `discardRequestRecord()`

## The `Statistics` persistence lifecycle is stricter

`persistState()` and `resetStore()` no longer take `PersistenceOptions` — persistence is enabled or disabled once, in the constructor. `resetStore()` throws while the instance is capturing, where the next `PERSIST_STATE` event would write the record straight back; call it before `startCapturing()` or after `stopCapturing()`. And `reset()` only resets the counters — it no longer stops an ongoing capture, which `stopCapturing()` does.

A persisted record is also validated on load now. One that does not match the expected shape is discarded whole, with a warning, and the statistics start from scratch — where v3 would copy the malformed values into the live state and let them corrupt every later increment. Custom fields are scoped the same way: when `stateExtension.deserialize` throws, only those fields restart and the built-in counters are kept.

## Subclassing `Statistics` to track extra fields is replaced by the `stateExtension` option

`persistStateKey`, `toJSON()` and `_maybeLoadStatistics()` were `protected` and are now private. Declare extra fields via the new `stateExtension` option instead — `{ defaultState, deserialize, serialize }`, the same trio `RecoverableState` takes, scoped to the custom fields. See the [Custom statistics fields](../../guides/custom-statistics.mdx) guide.

The persisted record is now validated strictly, and keys that are neither built-in nor declared in `stateExtension` are dropped rather than written back. `calculate()` is still public and still an override point.

The custom field types reach `crawler.statistics.state` through a new trailing `StatisticStateExtension` type parameter on the crawler classes and their options. It defaults to `{}`, so existing type arguments keep working — except on `BrowserCrawler` and `BrowserCrawlerOptions`, where it was inserted after `Routes` and shifts the trailing internal parameters (`GoToOptions`, `__BrowserPlugins`, …). Adjust any explicit type arguments you passed to those two.

`AdaptivePlaywrightCrawler` now uses this mechanism for its own extra fields, with two consequences:

- `httpOnlyRequestHandlerRuns`, `browserRequestHandlerRuns` and `renderingTypeMispredictions` were typed as optional and are now always present. Reading them no longer needs a `?? 0`.
- The `statistics` option used to throw for this crawler; it now accepts any `IStatistics<AdaptivePlaywrightCrawlerStatisticState>`. Build one by extending the exported `adaptivePlaywrightCrawlerStatisticState`.
