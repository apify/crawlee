# Rebase deferrals — reconcile against `v4-reverse` before finishing

This file tracks resolutions made during the `v4` → `master` rebase that were
**not** brought fully to the desired end state (`v4-reverse`). Untracked on
purpose — delete once reconciled. Do a final `git diff <final-HEAD> v4-reverse`
per file to confirm nothing below was lost.

## `packages/http-crawler/src/internals/file-download.ts`

**Commit:** `cf72dda66` — `refactor!: Introduce the ContextPipeline abstraction (#3119)`

**What I did:** took #3119's coherent committed version of the whole file
(`git checkout --theirs`). The 3 conflict hunks were interdependent and 7 later
rebase commits reshape this file, so a hunk-by-hunk merge risked dangling
references.

**Deferred (present in `v4-reverse`, NOT re-added by any rebase commit — must be
folded back at the end):**
- Master's typed schema-router overload: `RouteSchemas` / `RoutesFromSchemas`
  imports from `../index.js`, and the `downloadFile`/router-factory overload that
  returns `RouterHandler<Context, RoutesFromSchemas<Schemas>>`. Type-level only,
  no runtime effect, compiles fine without it.
- Confirm `abortDownload` handling matches `v4-reverse` (v4-reverse keeps it; it
  may arrive via a later commit — verify it isn't dropped).

**Reconcile with:**
`git diff <final-HEAD>:packages/http-crawler/src/internals/file-download.ts \
  v4-reverse:packages/http-crawler/src/internals/file-download.ts`

## Master-only features that WERE folded in (not lost — listed for verification)

- `playwright-crawler.ts` `enhanceContext`: `listDownloads` (downloads array +
  `page.on('download')` + `listDownloads: async () => downloads`). Master-only,
  no rebase commit re-adds it; folded in to match `v4-reverse`.
- `browser-crawler.ts` `buildContextPipeline` cleanup: puppeteer-25
  `addTimeoutToPromise` wrapper around `page.close()`.
- `browser-crawler.ts`: kept master's `userRequestHandler` getter override.
- `adaptive-playwright-crawler.ts`: kept master's `shouldPropagateError` check,
  combined with #3119's `RequestHandlerError.cause` unwrap.

## General

Recurring mechanical conflicts (ESM `.js` imports, `test/shared/*` paths,
`3.17.0` version bumps, `RequestValidationError`/`zod` schema-feature imports)
are auto-applied by git rerere. Verify each rerere-resolved commit is
marker-free; spot-checked so far and clean.

## Possible duplicate import to verify — `adaptive-playwright-crawler.ts`

At/after the ContextPipeline commit, the top of
`packages/playwright-crawler/src/internals/adaptive-playwright-crawler.ts` may
import `BrowserHook` / `LoadedRequest` / `Request` from `@crawlee/browser` on
BOTH an early `import type {...}` block and a later
`import type { BasicCrawlerOptions, BrowserHook, LoadedRequest, Request } from '@crawlee/browser'`.
Duplicate type imports from the same module = TS error. Check the final tree and
dedupe if present (a later rebase commit may already fix it).

## Latent bug — `packages/core/src/storages/request_list.ts` dangling `this.events`

Commit `ba3a3568a` (`refactor!: Extract service management from Configuration
into ServiceLocator class #3325`) removes the `private events: EventManager`
field and its `this.events = config.getEventManager()` assignment, replacing
the one conflicting usage (`initialize()`'s `.on(EventType.PERSIST_STATE, ...)`
call) with `serviceLocator.getEventManager().on(...)`.

However, a master-only teardown method (not part of the conflict, already
auto-merged in) still calls `this.events.off(EventType.PERSIST_STATE, ...)`
around line 542 — `events` no longer exists on the class, so this is a
TypeScript compile error (`Property 'events' does not exist`).

**Confirmed this is not just my resolution**: `v4-reverse` has the identical
dangling `this.events.off(...)` call at its equivalent line. No commit further
along the rebase touches it either. This needs a manual fix — swap it to
`serviceLocator.getEventManager().off(EventType.PERSIST_STATE, this.persistState)`
— whenever the tree is type-checked.

## ServiceLocator commit (`ba3a3568a` #3325) — architecture collision in Snapshotter/SystemStatus

Master had already refactored `Snapshotter`/`SystemStatus` into a composable
`LoadSignal` architecture (memory/cpu/event-loop/client signal objects with
`.start()/.stop()/.handle()`) in an earlier-applied commit. `ba3a3568a` is v4's
older, pre-LoadSignal, monolithic interval-based Snapshotter rewritten only for
ServiceLocator. These two are fundamentally different implementations of the
same class — verified against `v4-reverse` that the LoadSignal architecture
survives, so for every conflicting method (imports, class fields, `start()`,
`stop()`, `_snapshotClient`/`handle()`) I kept HEAD's LoadSignal delegation and
discarded theirs' interval/serviceLocator-direct logic entirely.

**Found and fixed a real latent bug in the process**: `Snapshotter`'s
constructor had its `client`/`config` destructuring and `this.client =
/this.config =` assignments silently dropped by an earlier (non-conflicting)
auto-merge upstream in this rebase, while `this.client`/`this.config` were
still referenced further down (passed into the `MemoryLoadSignal`/
`createCpuLoadSignal`/`createClientLoadSignal` factories, which — at this point
in history — still require them as explicit params; they don't yet pull from
`serviceLocator` internally). Restored the wiring using commit `308da2263`
(an early point in this rebase where it was still intact) as reference,
adapted to call `serviceLocator.getConfiguration()` /
`serviceLocator.getStorageClient()` as defaults (matching this commit's
intent) instead of the old `Configuration.getGlobalConfig()` /
`config.getStorageClient()`. Also switched the `Configuration` import to
`import type` since it's now type-only in this file.

`SystemStatus` needed the same reconciliation: kept master's `loadSignals`
option (composes custom signals with the snapshotter's built-in ones) but
dropped the `config` option/field entirely — `new Snapshotter()` with no args
now works since the above fix wires its own `serviceLocator` defaults.

`storage_manager.ts` had a similar merge artifact: an unconflicted `try/finally`
wrapped body (from a separate already-applied commit) duplicated by this
commit's non-try/finally version of the same logic, producing a dead
duplicate tail after the conflict markers. Deleted the duplicate and applied
this commit's actual semantic change (`this.config.getStorageClient()` →
`serviceLocator.getStorageClient()`) to the surviving copy.

**Please re-verify** the `Snapshotter`/`SystemStatus`/`storage_manager.ts`
resolutions once dependencies are installed and `tsc`/tests can run — these
were reasoned through by reading surrounding code and cross-checking
`v4-reverse`, not verified by a compiler.

## Fixed a real dead-function bug — `local_event_manager.ts` `getMemoryInfoV2`

While resolving commit `7c3ba07ea` ("refactor: resolve last direct @apify/log
calls"), found that `LocalEventManager`'s private `getMemoryInfo()` helper
branched on `this.config.get('systemInfoV2')` to call `getMemoryInfoV2(...)` —
but **`getMemoryInfoV2` does not exist anywhere in `@crawlee/utils`** (only
`getMemoryInfo` and `getCurrentCpuTicksV2` exist; the CPU side got a real V2
implementation, the memory side never did). That branch would throw
`ReferenceError` at runtime for anyone with `systemInfoV2` config enabled.

Also found the surviving (non-V2) branch's `getMemoryInfo()` call had no
import at all in scope — a dangling reference from an earlier upstream
auto-merge, same class of bug as the `request_list.ts` one documented above.

**Fix applied**: collapsed the private `getMemoryInfo()` method to just the
working path — dynamically imports `getMemoryInfo` from `@crawlee/utils` and
passes `containerized`/`logger`, matching this commit's intent and the
pattern already used by the sibling `createCpuInfo()` method (which does have
a working V2 path via `getCurrentCpuTicksV2`). Dropped the dead
`systemInfoV2`/`getMemoryInfoV2` branch entirely rather than inventing a
`getMemoryInfoV2` implementation, which would be scope creep beyond a merge
conflict fix. `LocalEventManager.prototype.getMemoryInfo` is still spied on by
`test/core/autoscaling/snapshotter.test.ts`, so the method itself is kept —
only its broken internals were fixed.

**Please verify**: if a memory-specific V2 code path was intended (mirroring
`getCurrentCpuTicksV2`), it needs to be implemented for real — this fix does
not add one, it just removes a dead reference to a non-existent one.

## yarn → pnpm migration (`930b2ef4f`) — needs verification with a real `pnpm install`

Per your explicit choice, I took theirs (pnpm) fully for this commit: deleted
`yarn.lock`, `docs/yarn.lock`, `website/yarn.lock`, `.yarnrc.yml`; adopted
`pnpm@10.24.0` as `packageManager`/volta; rewrote CI workflow yarn/corepack
steps to `apify/workflows/pnpm-install@main`; kept master's newer
devDependency versions (`@apify/tsconfig`, `@commitlint`, `@playwright/browser-*`,
`typescript`, `playwright`, docusaurus 3.10.2) alongside the new oxlint/oxfmt +
pnpm tooling.

**One thing I could not verify mechanically**: master's root `package.json`
had a yarn-only `"resolutions"` block (`tmp`, `@puppeteer/browsers`,
`playwright-core@1.61.1`, `form-data`, `tar`, `lerna/js-yaml`) that this
commit drops in favor of pnpm's `overrides` in `pnpm-workspace.yaml` (which
already carried v4's own `playwright-core@1.58.2`, `@browserbasehq/stagehand`,
`minimatch` overrides). I merged master's entries into that `overrides:`
block, bumping `playwright-core` to `1.61.1` to match the `playwright`
devDependency version we kept (a version mismatch between the two would be
worse than dropping the override). For the yarn-specific nested-scope
override `lerna/js-yaml`, I translated it to pnpm's `"lerna>js-yaml"` syntax
— **this translation is unverified**; pnpm's override key syntax has specific
rules I can't test without actually running `pnpm install` (which requires
installing the new package manager). Please run `pnpm install` and confirm
the lockfile resolves cleanly, especially the `js-yaml` override under
`lerna`.

## `storage_manager.ts` `openStorage` — kept try/finally around the new StorageClient logic

Commit `ffff3347e` (`refactor!: Overhaul the StorageClient interface #3570`)
rewrites `StorageManager.openStorage` to resolve identifiers via
`_resolveIdentifier`/`_createSubClient` (both already present unconflicted
elsewhere in the file). Its own version of the method does NOT wrap the body
in `try/finally` — `this.storageOpenQueue.shift()` runs as a plain trailing
statement. The pre-this-commit version (which I'd already resolved in an
earlier conflict) wrapped the equivalent logic in `try { ... } finally {
this.storageOpenQueue.shift(); }` specifically so the queue lock is always
released even if resolution/creation throws.

I kept the `try/finally` safety net around theirs' new logic rather than
taking the method verbatim, since dropping it reintroduces a real deadlock
risk (a failed `_resolveIdentifier`/`_createSubClient`/`getMetadata` call
would permanently wedge `storageOpenQueue` for all subsequent `openStorage`
calls on that manager). This wasn't verifiable against `v4-reverse` (that
file is renamed/rewritten further into `storage_instance_manager.ts` with an
unrelated alias-based architecture by then). Worth a second look once you can
run the test suite.

## Fixed more dead API calls — `Configuration` redesign (`d1f4c98e5` #3484)

This commit ("feat: redesign `Configuration` class for v4") replaces
`Configuration`'s `.get(key, default)`/`.set()` accessor methods with plain
property access (e.g. `config.availableMemoryRatio` instead of
`config.get('availableMemoryRatio')`), and removes `Configuration.getEventManager()`/
`.getStorageClient()` entirely (those now only live on `serviceLocator`).

Same class of bug as the `request_list.ts`/`local_event_manager.ts` issues
documented above: two files outside this commit's own diff — never flagged
by any merge conflict — still called the now-deleted methods:

- `packages/core/src/autoscaling/memory_load_signal.ts`: `this.config.get(...)`
  (×3) and `this.config.getEventManager()`. Fixed to plain property access
  (`this.config.memoryMbytes`, `.availableMemoryRatio`, `.containerized`) and
  `serviceLocator.getEventManager()`. Also dropped the `systemInfoV2`/
  `getMemoryInfoV2` branch in `_getTotalMemoryBytes()` — confirmed
  `getMemoryInfoV2` doesn't exist anywhere in `@crawlee/utils` (same dead
  function found earlier in `local_event_manager.ts`) and `systemInfoV2`
  isn't a field on the new `Configuration` schema either. Restored the
  `isContainerized()` auto-detect fallback (`this.config.containerized ??
  (await isContainerized())`) to match the behavior the original code had,
  since `getMemoryInfo()`'s own default for missing `containerized` is `false`,
  not auto-detection.
- `packages/core/src/autoscaling/cpu_load_signal.ts`: `options.config.getEventManager()`
  → `serviceLocator.getEventManager()`. Left the now-unused-but-still-required
  `config: Configuration` field on `CpuLoadSignalOptions` alone rather than
  reworking the signal-creation API — `Snapshotter` still passes `config` when
  constructing this signal, so removing the field would be a wider API change
  outside the scope of this fix.

Repo-wide grep after these fixes shows no remaining `.config.get(...)`,
`.config.getEventManager()`, or `.config.getStorageClient()` calls anywhere
under `packages/*/src`. Please re-verify once the tree can be type-checked —
these were reasoned through by reading the new `Configuration` class and
cross-referencing the already-fixed sibling file, not compiler-verified.

## Update: `lerna>js-yaml` override syntax confirmed correct

A later commit (`36022e7c7`, "pin lerna's minimatch to v3") independently adds
`"lerna>minimatch": "^3.1.4"` to `pnpm-workspace.yaml`'s `overrides`, with a
comment explaining lerna's bundled code needs the CJS-style v3 export. This
confirms the `"packageA>packageB"` scoped-override syntax I used for
`lerna>js-yaml` (flagged as unverified above) is exactly right — no longer a
concern.

## `e00aa9419` — DatasetClient/KeyValueStoreClient aligned with Python (rename support removed)

This commit removes `update()` (rename-a-storage support) entirely from
`DatasetClient`/`KeyValueStoreClient`/`RequestQueueClient` in memory-storage,
renames `delete()` → `drop()`, and adds `purge()`. Confirmed via
`packages/types/src/storages.ts`: the interface no longer declares `update()`
at all, only `drop()`/`purge()` — so removing the implementations was correct,
not a data-loss risk.

For each of the three resource-client files I dropped the `update()` method
body along with the `resolveWithinDirectory`/`move`-based rename logic it
contained, kept the constructor's own `resolveWithinDirectory(...)` call
(master's path-traversal hardening — confirmed via `git show
e00aa9419:...` that v4's own version of these files uses a bare `resolve()`
in the constructor too, so this hardening predates/is independent of this
commit and must survive it), and adopted `drop()`. Also removed now-dead
imports (`createKeyList`/`createKeyStringList`/`createLazyIterablePromise` in
key-value-store.ts — `keys()`/`values()`/`entries()` no longer exist on the
class; `Readable`, `move`, `StorageTypes` similarly unused post-removal).

**`packages/memory-storage/test/async-iteration.test.ts`**: HEAD's version
tested `kvStore.keys()`/`.values()`/`.entries()` and imported
`createLazyIterablePromise` — none of which exist anymore (confirmed via
grep on the resolved `key-value-store.ts`). Rather than attempt a partial
merge of an obsolete test suite, took theirs' version of the whole file
wholesale (`git checkout --theirs`) — it tests the new `getData()`/
`listKeys()` API directly and is self-contained.

**`packages/memory-storage/test/request-queue/handledRequestCount-should-update.test.ts`**:
HEAD added two new tests. One ("deleting a request should decrement...")
calls `requestQueue.deleteRequest(id)`, which doesn't exist on the current
`RequestQueueClient` (no per-request delete method at all in this interface,
confirmed via grep of all `async` methods) — dropped, it tests a capability
that isn't there. The other ("updating an already handled request should not
increment...") calls `requestQueue.get()` (renamed to `getMetadata()`) but is
otherwise valid and valuable — it's the regression test for the exact
`isRequestHandledStateChanging` double-count fix preserved during an earlier
conflict in this same rebase (commit `20b320add`'s `request-queue.ts`
conflict). Kept it, renamed `get()` → `getMetadata()`.

**Commit `ebb1b2632` (Introduce IBrowserPool interface) — moved the puppeteer-25
`page.close()` timeout guard**: master (`1430062c2`) had wrapped
`page.close()` in `browser-crawler.ts` with a 5s `addTimeoutToPromise` guard
(puppeteer 25 can hang `page.close()` indefinitely after an aborted
navigation). This v4 commit replaces that direct `page.close()` call with
`this.browserPool.closePage(context.page, { error })`, moving page-closing
into the pool abstraction. To keep both fixes, moved the timeout guard itself
into `browser-pool.ts`'s `closePage()` method (added `PAGE_CLOSE_TIMEOUT_MILLIS`
there, imported `addTimeoutToPromise`) rather than doubly closing the page
from both `browser-crawler.ts` and the pool. Removed the now-dead
`PAGE_CLOSE_TIMEOUT_MILLIS` constant from `browser-crawler.ts` (no other use).
Worth double-checking in review that no other caller of `closePage()` relies
on it settling faster than 5s.

**Found and fixed a real regression in `packages/basic-crawler/src/internals/basic-crawler.ts`
(surfaced while resolving commit `f1f095913`)**: master (`1430062c2`, via commit `b2296cea7
fix: Correctly track the number of requests handled by a crawler (#3410)`) turned
`handledRequestsCount` into a getter derived from `this.stats`, with a setter that
*throws* if assigned to (property is meant to be read-only now). v4 has the same fix
under a different hash (`93dda9656`), which is why it's absent from this rebase's
todo — my rebase base already includes the master version. However, several later
v4 commits I already applied earlier in this rebase (including `0c1fbcfe7`, the
IRequestManager/IRequestLoader transition) reintroduced code written against the
*old* pre-fix API: a `this.handledRequestsCount = 0;` reset in `_rotateRequestQueue`
(or equivalent), a `_loadHandledRequestCount()` method that assigned to the setter,
and a call to it from `_init()`. All three would throw at runtime the first time
they ran (the setter always throws). Removed all three, and removed the
`this.handledRequestsCount++` this conflict itself reintroduced in the failed-request
path, matching master's already-established fix. Worth double-checking, once the
rebase is fully done, that no other spot re-assigns `handledRequestsCount`.

**Commit `f1f095913` (Align RequestQueueClient interface with Python counterpart)
— ported master-only `addRequestsBatched` features into the new unified
`request_queue.ts`**: this v4 commit deletes `request_provider.ts` and
`request_queue_v2.ts` wholesale, replacing them with a single new
`request_queue.ts` (already present, unconflicted, since it's a new file from
v4's side). The new file's `addRequestsBatched()` was a rewrite from an older
point in v4 history and was missing two features that only exist on master
(`1430062c2`) and are still actively used by already-applied v4 commits later
in this rebase (`enqueue_links.ts` reads `result.requestsOverLimit`, added by
master commits `b23319bbe`/`f3d9a7967` — "Prevent accidental request dropping
with maxRequestsPerCrawl"): the `maxNewRequests` budget/`requestsOverLimit`
mechanism, and the `MAX_UNPROCESSED_REQUESTS_RETRIES` retry cap (master commit
`b3170a60c`, prevents infinite retries when the platform permanently rejects a
request). Neither commit is an ancestor of the current v4-derived HEAD nor
present in the remaining rebase-todo (likely because they were independently
backported to master under different hashes than their v4 equivalents,
`a50afb62d`/`6d4a75e74`, which never made it into this rebase's commit list).
Ported both pieces verbatim from master's `request_provider.ts` into the new
`request_queue.ts` (constant, options fields, and the full
`attemptToAddToQueueAndAddAnyUnprocessed`/`processChunk`/`buildResult` body),
and restored the two master-only regression tests for them in
`test/core/storages/request_queue.test.ts` (`addRequestsBatched does not retry
permanently unprocessed requests forever`, `addRequestsBatched does not
re-submit already enqueued requests beyond the initial batch (#3120)`).

Also found and dropped a genuine dead/duplicated code block in
`packages/memory-storage/src/resource-clients/request-queue.ts`'s
`releaseOwnLocks()`: the conflict's HEAD side had a trailing block referencing
`requestModel`, `isRequestHandledStateChanging`, `requestWasHandledBeforeUpdate`
— variables that don't exist anywhere in `releaseOwnLocks()`'s scope. This was
leftover orphaned content from an old, already-superseded unified `update()`
method (removed from this file earlier in the rebase, per an earlier entry in
this log) that got misattached to `releaseOwnLocks()` by an earlier merge in
this same rebase. `releaseOwnLocks()` is self-contained in both master and v4
and doesn't touch `handledRequestCount` — deleted the dead block entirely.

Also dropped an orphaned 2-line test fragment in
`test/core/storages/request_queue.test.ts`: `f1f095913` renamed `'should cache
new requests locally'` to `'adding the same uniqueKey twice does not duplicate
and is served from the local cache'` with a substantially rewritten body (a
rename + rewrite, not a simple edit). Git's merge left the old test's opening
two lines behind as an unconflicting fragment ahead of the conflict region;
the renamed test's full new body already landed earlier in the file
(confirmed via grep, `line 61`). Deleted the orphaned fragment.

**Commit `a9b972294` (Split MemoryStorage into FileSystemStorageClient and
MemoryStorageClient) — ported the path-traversal hardening into the new
`@crawlee/fs-storage` package**: this commit splits the old
`@crawlee/memory-storage` into a pure in-memory client (stays in
`memory-storage`, drops all filesystem code) and a new `@crawlee/fs-storage`
package (the file-system-backed implementation, entirely new files, not
conflicted). The new `fs-storage` resource clients
(`dataset.ts`/`key-value-store.ts`/`request-queue.ts`) build their storage
directory as `resolve(baseStorageDirectory, directoryName)` using plain
`node:path` `resolve()` — this is the exact path-traversal vulnerability
master's `resolveWithinDirectory()` helper (commit `a04c29766
fix(memory-storage): prevent storage names from escaping the storage
directory (#3715)`) fixed for the old combined package. Since `fs-storage` is
a wholesale new copy of that same pre-fix code (not derived from
`memory-storage`'s post-fix version), the vulnerability was reintroduced.
Ported `resolveWithinDirectory` into `packages/fs-storage/src/utils.ts` and
switched all three resource clients' directory-construction call to use it
(left the `rm(resolve(this.xDirectory, entry))` calls alone — those resolve
internally-generated entry names, not user-controlled names/keys, matching
the scope of the original fix). Resolved the conflicts in the `memory-storage`
copies of these same three files by taking theirs' side throughout (drop
`directoryName`/`resolveWithinDirectory`/filesystem imports in favor of the
new `cacheKey`-only in-memory identity) — `memory-storage` no longer touches
the filesystem at all post-split, so the hardening there is not applicable
(it now lives solely in `fs-storage`).

Note: the original `a04c29766` fix's description also mentions hardening
key-value-store record keys (`setRecord({ key })`), not just storage names.
I only found and fixed the storage-name/directoryName call site in the new
`fs-storage` package — worth a follow-up check once the rebase is done to see
whether record-key path construction (likely inside
`fs-storage/src/fs/key-value-store/*.ts`) needs the same treatment.

**Follow-up on the above, resolved immediately**: checked
`packages/fs-storage/src/fs/key-value-store/fs.ts` — it already used
`resolveWithinDirectory` for its main `update()` path (carried over cleanly
from an earlier point in this rebase), but its `get()` fallback (the
no-file-extension retry path) still called bare `resolve(this.storeDirectory,
this.rawRecord.key)` on a record key — worse, `resolve` wasn't even imported
in that file anymore, so this line would have been a compile error. Fixed to
use `resolveWithinDirectory`, matching master. Checked the sibling
`fs/dataset/fs.ts` and `fs/request-queue/fs.ts` for the same pattern — both
build their file path from internally-generated, non-user-controlled IDs
(sequential entity index, hashed request ID), which is exactly what master's
original fix (`a04c29766`) called out as already safe, so left them as
plain `resolve()`.

**Commit `3365b2d0e` (Dissolve @crawlee/memory-storage into @crawlee/core)
— rewrote two stale master-only security-regression tests that referenced a
long-gone API**: this commit folds `@crawlee/memory-storage` (the pure
in-memory client) into `@crawlee/core`. Git flagged two master-only test
files (`packages/memory-storage/test/key-value-store/record-key-path-traversal.test.ts`
and `packages/memory-storage/test/storage-name-path-traversal.test.ts` — the
regression tests for the `resolveWithinDirectory` path-traversal fix,
`a04c29766`) as "file location" conflicts, suggesting they move to
`packages/core/test/memory-storage/...` alongside the dissolved package's
other tests. That location is wrong: both tests exercise disk-escape
prevention (`persistStorage: true`, checking files on disk), but
`MemoryStorageClient` (the class that lands in `@crawlee/core`) is pure
in-memory post-split and never touches the filesystem — the vulnerability
and its fix now live entirely in `@crawlee/fs-storage`. Moved both to
`packages/fs-storage/test/` instead.

Their content was also fully stale — written against the pre-rebase API
(`new MemoryStorage(...)`, `.keyValueStores().getOrCreate()`,
`client.setRecord()`, `client.update({ name })` for renaming) that no longer
exists anywhere in this branch after ~30 commits of refactors applied earlier
in this rebase (Python-alignment renames, ServiceLocator, the fs-storage
split, KVS value-semantics centralization). Rewrote both against the current
`FileSystemStorageClient` API (`createKeyValueStoreClient({ name })` /
`createDatasetClient({ name })` / `createRequestQueueClient({ name })`,
`client.setValue({ key, value, contentType })`, `client.getMetadata()`).
Dropped the "rename via update rejects escaping names" test in
`storage-name-path-traversal.test.ts` — `update()`/rename support was removed
entirely earlier in this rebase (commit `e00aa9419`), so there is no longer
an operation to test here.

While in there, also found and fixed the same class of staleness in
`packages/core/test/memory-storage/request-queue/handledRequestCount-should-update.test.ts`
(this one auto-merged cleanly, no conflict, so it would have silently landed
broken): its third test called `requestQueue.updateRequest(...)`, an API that
no longer exists. The equivalent already-migrated test in
`packages/fs-storage/test/request-queue/handledRequestCount-should-update.test.ts`
(from an earlier commit in this same rebase) had already dropped this exact
test for the same reason — did the same here for consistency.

**Commit `8a422628f` (Rewrite the FilesystemStorageClient to use
apify/crawlee-storage) — took theirs' side wholesale, dropping my manual
path-traversal hardening in `@crawlee/fs-storage`**: this commit replaces the
entire hand-rolled TypeScript filesystem implementation (`cache-helpers.ts`,
`fs/key-value-store/fs.ts`, and the dataset/kvs/request-queue resource
clients) with thin adapters around a native Rust extension
(`@crawlee/fs-storage-native`). `cache-helpers.ts` and `fs/key-value-store/fs.ts`
are deleted outright — accepted the deletion (`git rm`) since their
responsibilities (directory resolution, path safety, file I/O) move into the
native library. For the resource-client content conflicts
(`dataset.ts`/`key-value-store.ts`/`request-queue.ts`/`utils.ts`), took theirs
wholesale rather than re-porting the `resolveWithinDirectory` hardening
(documented earlier in this log, under the `a9b972294` and `39f689f33`
entries) — checked `v4-reverse` first per the established practice for
architecture-level collisions, and its equivalent files (a later rename to
`DatasetBackend`/`FileSystemStorageBackend` etc., but structurally identical)
also drop the manual TS-level hardening entirely, confirming the native
package is expected to own path safety internally rather than the TS adapter
layer re-implementing it.

**Follow-up needed once the rebase is done**: I have not verified that
`@crawlee/fs-storage-native` actually rejects path-traversal storage
names/record keys the way `resolveWithinDirectory` did. This should be
checked directly (either by reading the native crate's source if vendored, or
by a quick escape-attempt test against the new `FileSystemStorageClient`)
before considering the `a04c29766` security fix's guarantees intact
post-rewrite.
