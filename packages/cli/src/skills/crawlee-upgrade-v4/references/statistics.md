# Statistics

`statisticsOptions` is removed. Construct `new Statistics(options)` from `@crawlee/basic` and pass it as `statistics`. `crawler.stats` becomes `crawler.statistics`, typed as `IStatistics`. Supplied statistics retain their state across runs; the crawler drives capture but does not reset borrowed statistics.

| v3 | v4 |
| --- | --- |
| `startJob()` | `recordRequestStart()` |
| `finishJob()` | `recordRequestSuccess()` |
| `failJob()` | `recordRequestFailure()` |
| `discardJob()` | `discardRequestRecord()` |
| `requestsFinished` | `requestsSucceeded` |
| `requestsFinishedPerMinute` | `requestsSucceededPerMinute` |
| `requestTotalFinishedDurationMillis` | `requestTotalSucceededDurationMillis` |
| `requestAvgFinishedDurationMillis` | `requestAvgSucceededDurationMillis` |

Update runtime, calculated and persisted counters. `crawlerFinishedAt` stays unchanged. Internal persisted keys use `CRAWLEE_` instead of `SDK_`.

`persistState()` and `resetStore()` lose persistence-option arguments. Configure persistence once in the constructor. `resetStore()` throws while capturing; call before `startCapturing()` or after `stopCapturing()`. `reset()` resets counters without stopping capture. An invalid built-in record is discarded whole with a warning; a failing `stateExtension.deserialize` resets only the custom fields and keeps the counters.

Replace overrides of the formerly protected `persistStateKey`, `toJSON()` and `_maybeLoadStatistics()` with `stateExtension: { defaultState, deserialize, serialize }`; the serialization steps are private in v4. Persisted keys not built-in or declared in the extension are dropped. `calculate()` remains an override point.

Crawler classes have a trailing `StatisticStateExtension` parameter. On `BrowserCrawler` and its options it follows `Routes`, shifting trailing internal generic arguments. Update explicit generics where used.

Adaptive statistics fields `httpOnlyRequestHandlerRuns`, `browserRequestHandlerRuns` and `renderingTypeMispredictions` are always present. Its `statistics` option accepts `IStatistics<AdaptivePlaywrightCrawlerStatisticState>`; use `adaptivePlaywrightCrawlerStatisticState` when extending the state.
