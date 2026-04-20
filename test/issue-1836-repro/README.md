# Issue #1836 repro — `maxUsageCount` is not respected by `SessionPool`

Reproduction for <https://github.com/apify/crawlee/issues/1836>, tested against
both the current `v4` branch (published as `crawlee@4.0.0-beta.47`) and the
current `master` / `v3` branch (published as `crawlee@3.16.0`).

## Running

```bash
# v3 (master)
cd v3 && npm install && node reproduce.mjs

# v4
cd v4 && npm install && node reproduce.mjs
```

The script spins up a tiny local HTTP server (so the repro has no external
dependencies), runs a `CheerioCrawler` with `sessionOptions.maxUsageCount = 1`
against 10 URLs, then prints the final state of every session in the pool.

## Result: bug reproduces on both versions

| crawlee version | URLs | sessions created | sessions with `usageCount > maxUsageCount` | final `usageCount` per session | final `errorScore` per session |
| --- | --- | --- | --- | --- | --- |
| 3.16.0 (`master`) | 10 | 10 | 10 (100%) | 2 | 3 |
| 4.0.0-beta.47 (`v4`) | 10 | 10 | 10 (100%) | 2 | 3 |

Every single session ends up with `usageCount = 2` even though `maxUsageCount`
was configured as `1`, matching the original bug report (and the comment
["every request increases the `usageCount` of one session by 2"](https://github.com/apify/crawlee/issues/1836#issuecomment-2443390143)).

## Root cause (shared by both versions)

`packages/core/src/session_pool/session.ts`:

- `markGood()` — called after every successful request — does:
  1. `_usageCount += 1` (so `0 → 1`, reaching `maxUsageCount`)
  2. calls `_maybeSelfRetire()`, which checks `!isUsable()` (now true, because
     `usageCount >= maxUsageCount`) and calls `retire()`
- `retire()` in turn does:
  1. `_errorScore += _maxErrorScore` (`0 → 3`)
  2. `_usageCount += 1` (`1 → 2`)

So a clean one-shot session that saw exactly one successful request ends up
with `usageCount = 2, errorScore = maxErrorScore = 3`, which is what the
persisted `SDK_SESSION_POOL_STATE.json` shows in the original report.

`markBad()` has the same pattern: increments `usageCount`, then
`_maybeSelfRetire()` may call `retire()` which increments it again.

## Notes on the v4 differences

- `v4` removed the `sessionPoolOptions` constructor option from crawlers —
  the repro constructs a `SessionPool` explicitly and passes it via the new
  `sessionPool` option. (This is why the v3 repro sets `sessionPoolOptions`
  inline but the v4 repro does not.)
- Independently, `packages/basic-crawler/src/internals/basic-crawler.ts`
  `resolveSession()` in `v4` now calls
  `sessionPool.newSession({ maxUsageCount: 1, … })` for every request that
  isn't already bound to a `sessionId` — i.e. `v4` effectively hard-codes
  one session per request and ignores a pool-level `maxUsageCount` setting
  anyway. Even with that behavior change, the `markGood → _maybeSelfRetire →
  retire` double-count described above still fires, so the underlying bug is
  unchanged between `v3` and `v4`.

## Secondary ("more sessions than needed") claim

The original report also says 15 sessions are created for 10 URLs with
`PlaywrightCrawler`. That part is concurrency-dependent: multiple tasks race
through `SessionPool.getSession()` → `_hasSpaceForSession()` → `_createSession()`
simultaneously before any of them have a chance to reuse an existing session.
It's harder to hit with `CheerioCrawler` against `127.0.0.1` because requests
finish much faster than browser requests, but the `markGood → retire`
double-count above is sufficient on its own to violate the documented
`maxUsageCount` contract.
