# Surface decisions

Contracts whose answer depends on product intent rather than on evidence — either still open, or
decided but not yet implemented. Each entry records what is true today so the work can be picked
up without re-deriving any of it.

---

## The `{ request }` argument of `newProxyInfo` / `newUrl` / `ProxyConfigurationFunction`

**Status:** promised (untagged, present in `crawlee-core.api.md`), documented with a worked
example, and **never populated by anything**.

### What is declared

`ProxyConfiguration.newUrl()` and `.newProxyInfo()` both accept an options object carrying a
`request`, and `ProxyConfigurationFunction` / `ProxyConfigurationOptions.newUrlFunction` receive
the same. See `packages/core/src/proxy_configuration.ts` — the parameter type, both methods, and
the function type.

### What actually happens

Every in-repo call site passes nothing. Searching `newProxyInfo\(|\.newUrl\(` across `packages/`
and `test/` finds exactly three, all zero-argument:

- `packages/basic-crawler/src/internals/basic-crawler.ts` — once per `Session`, at session
  creation, storing the result on `session.proxyInfo`
- `packages/core/src/storages/request_queue.ts` — once per storage fetch
- `packages/core/src/storages/request_list.ts` — once per storage fetch

So `request` is always `undefined`. The consequence is visible in our own documentation:
`docs/guides/proxy_management.mdx` shows a `newUrlFunction` branching on
`request?.url.includes('crawlee.dev')` to skip the proxy for one domain. That branch cannot
execute. The doc comment on `newUrlFunction` hedges with "when applicable", which currently
means never.

### Why it was never wired

Per-request proxy selection and sticky sessions are in direct tension, and this is the real
decision.

Today's sticky-IP behaviour is achieved *by* calling `newProxyInfo()` exactly once per `Session`
and reusing the stored result — no session identifier is ever passed down to the proxy layer.
The Apify SDK's override mints a fresh `session-<random>` on every call. So moving the call to
request time, which is the shape the `request` parameter invites, would give every request a new
Apify Proxy session and silently destroy the one-IP-per-session property that
`docs/guides/session_management.mdx` sells. Nothing would fail; block rates would just rise.

That is also why this is a *silent* contract: the call frequency is the promise, and no type,
test or snapshot records it.

### The two options

**Wire it.** Thread the request through from where the crawler resolves the session, so
per-request proxy selection works as documented. Cost: the sticky-IP property has to be
preserved deliberately rather than falling out of the call pattern — probably by keying the
proxy URL on the session and only re-minting when the caller actually varies the request. This
is the larger change and it touches the SDK's override.

**Drop it.** Remove the parameter from the two methods and both function types, and rewrite the
`proxy_management.mdx` example to select proxies by some other means (separate
`ProxyConfiguration` instances, or `sessionId`-keyed named sessions). Cheaper and honest, and it
makes a documented feature that never worked stop being advertised. Breaking, so it needs an
`upgrading_v4.md` entry.

### Not an option

Leaving it as-is. A promised, documented parameter that is structurally always `undefined` is
worse than either resolution: it reads as a supported feature, our own guide demonstrates it,
and the first person to rely on it gets no error — just a branch that never runs.

---

## `StorageBackend.stats.rateLimitErrors`

**Status:** decided — the signal is a real feature and the Apify backend should populate `stats`.
Not yet implemented on either side. **Crawlee must declare the shape's semantics before the SDK
implements against it**, otherwise the two repos guess independently at what the array means.

### What is declared

`packages/types/src/storages.ts` — the last member of `StorageBackend`:

```ts
stats?: { rateLimitErrors: number[] };
```

That is the entire declared contract: an optional bag holding an array of numbers.

### What the consumer actually requires

`packages/core/src/autoscaling/storage_backend_load_signal.ts` reads it as follows — a local
`RATE_LIMIT_ERROR_RETRY_COUNT = 2` selects **one slot**, and `handle()` compares it against the
previous snapshot:

```ts
const allErrorCounts = this.#storageBackend?.stats?.rateLimitErrors ?? [];
const currentErrCount = allErrorCounts[RATE_LIMIT_ERROR_RETRY_COUNT] || 0;
// …
const delta = currentErrCount - previousSnapshot.rateLimitErrorCount;
if (delta > this.#maxErrors) snapshot.isOverloaded = true;
```

So four things are load-bearing and none of them is expressed in the type:

1. **The array is indexed by retry count** — the constant's name is the only evidence for that.
   Only index `2` is ever read. What indices `0`, `1` and `3+` hold, and why `2` is the
   interesting one, is recorded nowhere; it has to be decided, not recovered.
2. **The counters must be cumulative and monotonic** for the process lifetime. The signal takes
   `current - previous`; a per-interval counter, or one that resets, yields a meaningless or
   negative delta and the signal silently stops firing.
3. **A shorter array is indistinguishable from zero errors.** `|| 0` swallows a missing slot, so
   a backend that reports two entries reads as "no rate limiting, ever".
4. **Scope is per backend instance**, since the signal holds one `#storageBackend` reference.
   Whether the counters are meant to be global to the process or per storage is undefined.

### Why nothing has caught this

No shipped backend populates `stats`: neither `MemoryStorageBackend`, nor
`FileSystemStorageBackend`, nor the SDK's `ApifyStorageBackend`. And the signal is **on by
default** — `Snapshotter` constructs it unless you pass `storageBackend: false`, and it polls once
a second. With no producer, `?? []` gives an empty array, `|| 0` gives a zero delta, and
`storageBackendInfo` reports `isOverloaded: false` forever.

Our own documentation has been quietly describing this state rather than the intended one:
`StorageBackendLoadSignal`'s class doc and `LoadSignalsOptions.storageBackend` both advise
switching the signal off "if the storage backend reports no rate-limit statistics, since it
otherwise polls it every second to no purpose" — which currently means every backend we ship.
Meanwhile `upgrading_v4.md` documents `loadSignals.storageBackend`, `StorageBackendLoadSignal`
and `SystemInfo.storageBackendInfo` as working features.

### The work, in order

1. **Declare the semantics in `@crawlee/types`** — index meaning, cumulative-and-monotonic,
   lifetime, scope, and the interpretation of a short array. Consider replacing the bare
   `number[]` with something self-describing, and moving `RATE_LIMIT_ERROR_RETRY_COUNT` out of
   the signal so producer and consumer share one constant instead of agreeing by luck.
2. **Populate it in the SDK's `ApifyStorageBackend`**, against the declared shape.
3. Once a real producer exists, revisit whether `stats` should stay optional. While it is
   optional the "not implemented" and "no rate limiting happening" cases are the same value.

Only step 1 is ours, and it blocks step 2.
