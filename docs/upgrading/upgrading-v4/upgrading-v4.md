---
id: upgrading-to-v4
title: Upgrading to v4
slug: /upgrading/upgrading-to-v4
---

import ApiLink from '@site/src/components/ApiLink';

This page summarizes the breaking changes in Crawlee v4. There are many, so the guide is organized to let you stop reading as early as possible:

- [What v4 does better](#what-v4-does-better) — why the migration is worth the trouble.
- [Upgrade with an AI coding tool](#upgrade-with-an-ai-coding-tool) — generate a migration prompt for your project.
- [Rename cheat sheet](#rename-cheat-sheet) — the purely mechanical renames, in one table.
- [Changes most users will hit](#changes-most-users-will-hit) — read this part in full.
- The **Only if you…** sections — each applies only if you use what its title says. Skim the titles and skip what doesn't concern you. The longer ones only summarize the changes here and link to a separate page with the details.
- [Appendix: removed symbols](./removed-symbols.md) — for when the compiler hands you a missing name and you want to know where it went.

## Upgrade with an AI coding tool

Run the v4 CLI from your project directory to print a migration prompt:

```sh
npx crawlee@v4 upgrade
```

Use the explicit `v4` release tag while v4 is in prerelease. A bare `crawlee` command in a v3 project runs its local v3 CLI, which does not have this command. The invoked v4 CLI keeps control of `upgrade` even when a v3 installation exists locally.

Paste the output into an AI coding tool that can read your project and the local files linked in the prompt. The command only prints instructions. They ask the tool to inspect, plan, migrate and verify, and to ask once before creating a Git branch and making incremental commits.

`upgrade` detects the current major from Crawlee runtime dependencies in the nearest `package.json`. It uses installed versions that match the declared ranges, or an unambiguous single-major range when dependencies are not installed. In a workspace, run it from the package being migrated. If detection is ambiguous, specify the starting major:

```sh
npx crawlee@v4 upgrade --from 3 --to 4
```

`--to` defaults to the newest bundled migration. Only v3 to v4 is bundled initially. As guides for later majors are added, the command builds a sequence that completes and verifies each major before starting the next. It rejects a path with a missing guide rather than skipping a major. To revisit migration work in a project already using v4, use `--from 3 --to 4`.

## What v4 does better

- **Timeouts that mean what they say.** Navigation and the request handler are [timed separately](#navigation-and-the-request-handler-are-timed-separately) — no more mysteriously summed limits — and a single route can get [its own timeout](#per-route-and-per-request-handler-timeouts) or extend it mid-flight.
- **Composable crawling context.** The new `extendContext` option and `ContextPipeline` composition replace subclassing tricks for [adding members to the crawling context](#crawling-context-no-longer-includes-a-reference-to-the-crawler-itself).
- **Bring your own implementation.** Crawlers now accept any [`ISessionPool`](./sessions-and-proxies.md#custom-sessionpool-implementations-via-the-isessionpool-interface), [`IBrowserPool`](./browser-management.md#custom-browserpool-implementations-via-the-ibrowserpool-interface), [`IRenderingTypePredictor`](./browser-management.md#custom-rendering-type-predictors-via-the-irenderingtypepredictor-interface), [`IRequestManager`](./request-loaders.md#request-loaders-and-managers) or [`IStatistics`](./statistics.md#statisticsoptions-is-replaced-by-a-statistics-instance) — and never tear down an instance they did not create, which [`await using` now does for you](#collaborators-you-own-are-disposable).
- **One concurrency budget for several crawlers.** The new [`ConcurrencySystem`](./autoscaling.md#autoscaling-moved-to-concurrencysystem) can be shared between crawlers, capping their combined concurrency instead of letting each one oversubscribe the host.
- **Native `fetch` types.** HTTP clients and `context.response` now use the [standard `Response`](#crawlingcontextresponse-is-now-of-type-response), and `got-scraping` is an [opt-in dependency](./http-clients.md#http-client-packages-and-basehttpclient-reshaped) instead of a mandatory one.
- **The session is the rotation unit.** A session carries its proxy, cookies and error score, and is rotated as a whole when blocked — replacing [proxy tiers](./sessions-and-proxies.md#tieredproxyurls-is-removed-from-proxyconfiguration) and [session rotation counters](#maxsessionrotations-and-requestsessionrotationcount-are-removed).
- **Crawlers stop stepping on each other.** Multiple crawlers in one process [no longer share the default request queue](#multiple-crawler-instances-use-separate-default-request-queues), and repeated `run()` calls [no longer empty it](#repeated-run-calls-no-longer-empty-the-request-queue) behind your back.
- **Cookies behave.** `sendRequest` finally [respects your `Cookie` header](#cookie-handling-in-httpcrawler-and-sendrequest), and browser cookies set inside the handler are [persisted to the session](#browser-cookies-are-also-persisted-after-requesthandler).
- **No half-written results.** Storage writes in a request handler are [transactional](#storage-writes-in-request-handlers-are-transactional) — a handler that throws leaves nothing behind, and its retry does not duplicate data.
- **Simpler storage backend contract.** A custom storage backend is now [4 classes instead of 7](./storage-backends.md#storagebackend-interface-simplified).

## Rename cheat sheet

The purely mechanical renames, collected in one place. Where a row links to a section, the rename also comes with a behavior or signature change — read it before renaming blindly.

| v3 | v4 |
| --- | --- |
| `handleRequestFunction` / `handlePageFunction` | `requestHandler` |
| `handleRequestTimeoutSecs` | `requestHandlerTimeoutSecs` |
| `handleFailedRequestFunction` | `failedRequestHandler` |
| `persistCookiesPerSession` | `saveResponseCookies` |
| `config` (option / property name) | `configuration` ([details](#config-is-renamed-to-configuration-everywhere)) |
| `Configuration.getGlobalConfig()` | `Configuration.getGlobalConfiguration()` |
| `LocalEventManager.fromConfig()` | `LocalEventManager.fromConfiguration()` |
| `StorageClient` | `StorageBackend` ([reshaped](./storage-backends.md#storagebackend-interface-simplified)) |
| `MemoryStorage` (`@crawlee/memory-storage`) | `MemoryStorageBackend` (`@crawlee/core`, [now memory-only](#memorystorage-split-into-filesystemstoragebackend-and-memorystoragebackend)) |
| `RequestQueueV1` / `RequestQueueV2` / `RequestProvider` | `RequestQueue` |
| `IRequestList` | `IRequestLoader` ([reshaped](./request-loaders.md#irequestlist-renamed-to-irequestloader)) |
| `SitemapRequestList` | `SitemapRequestLoader` ([details](./request-loaders.md#sitemaprequestlist-renamed-to-sitemaprequestloader)) |
| `RobotsFile` | `RobotsTxtFile` |
| `markRequestHandled()` | `markRequestAsHandled()` |
| `requestList.length()` / `requestList.handledCount()` | `await getTotalCount()` / `await getHandledCount()` |
| `requestList.isEmpty()` / `requestList.isFinished()` | `await checkReadiness()` ([details](./request-loaders.md#isempty--isfinished-replaced-by-checkreadiness)) |
| `Dataset.listItems()` | `Dataset.getData()` / `Dataset.values()` ([details](./storage-backends.md#datasetlistitems-replaced-by-datasetgetdata-and-datasetvalues)) |
| crawler options `requestList` / `requestQueue` | `requestManager` ([details](./request-loaders.md#crawler-requestlist--requestqueue-options-deprecated-in-favor-of-requestmanager)) |
| standalone `enqueueLinks({ urls, requestQueue })` | removed; `context.enqueueLinks()` or `addRequests()` ([details](./request-loaders.md#standalone-enqueuelinks-removed-enqueuelinksbyclickingelements-takes-requestmanager)) |
| `enqueueLinksByClickingElements({ requestQueue })` | `enqueueLinksByClickingElements({ requestManager })` |
| `enqueueLinks({ globs, regexps, pseudoUrls })` | `enqueueLinks({ include })` ([details](#globs-regexps-and-pseudourls-replaced-by-include)) |
| `(await enqueueLinks()).processedRequests` | `(await enqueueLinks()).addedRequests` ([details](#enqueuelinks-return-value-reshaped-addrequestsbatchedresult-instead-of-batchaddrequestsresult)) |
| `autoscaledPoolOptions` | `taskLoopOptions` ([narrowed](./autoscaling.md#autoscaledpooloptions-is-now-taskloopoptions-and-no-longer-carries-concurrency-config)) |
| `crawler.stats` | `crawler.statistics` ([retyped](./statistics.md#statisticsoptions-is-replaced-by-a-statistics-instance)) |
| `statistics.state.requestsFinished` (and the other `*Finished*` counters) | `requestsSucceeded` ([details](#finished-request-counters-are-renamed-to-succeeded)) |
| `statistics.startJob()` / `finishJob()` / `failJob()` / `discardJob()` | `recordRequestStart()` / `recordRequestSuccess()` / `recordRequestFailure()` / `discardRequestRecord()` ([details](./statistics.md#the-request-recording-methods-are-renamed)) |
| `browserPoolOptions` | `browserPool` + a `*BrowserPool()` factory ([details](#browserpooloptions-is-removed)) |
| `gotScraping` (from `@crawlee/utils`) | `GotScrapingHttpClient` (`@crawlee/got-scraping-client`) |
| `SDK_`-prefixed internal KVS keys | `CRAWLEE_`-prefixed ([details](#internal-kvs-keys-renamed)) |
| `ArgumentError` (from `ow`) | `ArgumentValidationError` ([details](#argument-validation-errors-use-zod)) |

## Changes most users will hit

Environment requirements, renamed options and behavior changes that nearly every project runs into. Read this whole section.

### ECMAScript modules

Crawlee v4 is a native ESM package now. It can be still consumed from a CJS project, as long as you use TypeScript and Node.js version that supports `require(esm)`.

### Node 22.13+ required

Support for older node versions was dropped.

### Actor projects need Apify SDK v4

Apify SDK 3.x does not run on `@crawlee/core@4`. Projects that depend on `apify` upgrade to `apify@4` together with Crawlee. The SDK has its own breaking changes to go through after the bump.

### Collaborators you own are disposable

A crawler never tears down an instance it did not build, so anything you construct and pass in — `SessionPool`, `ConcurrencySystem`, `BrowserPool`, `RenderingTypePredictor` — is yours to shut down. All of them implement `Symbol.asyncDispose`, so `await using` does it for you:

```typescript
await using concurrencySystem = new ConcurrencySystem({ maxConcurrency: 20 });
await concurrencySystem.start();

await Promise.all([a.run(), b.run()]);
```

The hook calls the same `stop()` / `teardown()` / `destroy()` method as before, and those stay — `await using` needs Node.js 24, and v4 supports Node.js 22.

### TypeScript 5.8+ required

Support for older TypeScript versions was dropped. Crawlee ships compiled JavaScript, so this only affects type-checking against its type declaration files — plain JavaScript projects are unaffected. In particular, a CJS TypeScript project needs TypeScript 5.8+ to type-check a `require()` of an ESM package like Crawlee; older versions might still work if your project is also ESM.

### Cheerio v1

Previously, we kept the dependency on cheerio locked to the latest RC version, since there were many breaking changes introduced in v1.0. This release bumps cheerio to the stable v1. Also, we now use the default `parse5` internally.

### Argument validation errors use zod

Argument validation moved from `ow` to [zod](https://zod.dev). Invalid inputs now throw `ArgumentValidationError` (previously ow's `ArgumentError`) — update any code catching it by name or `instanceof`.

The messages read field-first and name the received type, value, and the validated interface:

```text
// v3 (ow)
Expected property `maxRequestRetries` to be of type `number` but received type `string` in object `HttpCrawlerOptions`

// v4 (zod)
Invalid input: expected number, received the string `3` at `maxRequestRetries` in `HttpCrawlerOptions`
```

Unlike ow, all problems are reported at once (one line per issue), and arrays name their element type:

```text
Invalid input: expected number, received the string `many` at `maxRequestRetries` in `HttpCrawlerOptions`
Invalid input: expected an array of numbers, received the number `500` at `additionalHttpErrorStatusCodes` in `HttpCrawlerOptions`
```

For programmatic handling, the error exposes zod's structured output — `error.issues` (the [zod issues](https://zod.dev/error-customization) array) and `error.cause` (the raw `ZodError`):

```ts
try {
    new CheerioCrawler({ maxRequestRetries: '3' } as any);
} catch (error) {
    if (error instanceof ArgumentValidationError) {
        error.issues[0].path; // ['maxRequestRetries']
        error.cause; // ZodError
    }
}
```

One behavioral change: options validated against class interfaces (`httpClient`, `configuration`, `eventManager`) now require actual instances (`instanceof BaseHttpClient`, …) rather than duck-typed plain objects — extend the class (or `Object.create(BaseHttpClient.prototype)` in tests) instead of passing an object literal.

### Zod 4 required

`@crawlee/core` used to accept zod 3 as well; it now needs zod 4, for the codecs it validates persisted state with. Zod is an ordinary dependency rather than a peer, so a project pinned to zod 3 keeps working — it just ends up with both versions installed.

### Installing with `--omit=optional` breaks native dependencies

Crawlee v4 relies on more native, prebuilt dependencies than v3 did — notably the `impit` HTTP client and the `@crawlee/fs-storage-native` package backing `@crawlee/fs-storage`. Like other napi-rs-based packages, these ship one platform-specific binary per OS/architecture, distributed as `optionalDependencies` so that npm installs only the one matching your platform.

Running `npm install --omit=optional` (or the equivalent `yarn`/`pnpm` flag) skips all optional dependencies, including these platform binaries, so the native dependencies fail to install correctly. If your Dockerfile or install scripts carried over `--omit=optional` from a v3 project template, remove it — it is no longer safe to use with Crawlee v4.

### Deprecated crawler options are removed

The crawler following options are removed:

- `handleRequestFunction` -> `requestHandler`
- `handlePageFunction` -> `requestHandler`
- `handleRequestTimeoutSecs` -> `requestHandlerTimeoutSecs`
- `handleFailedRequestFunction` -> `failedRequestHandler`

### The `log` crawler option is replaced by `logger`

The crawler constructors no longer accept a `log` option with an `@apify/log` `Log` instance. Pass a `logger` implementing the `CrawleeLogger` interface instead. To keep using an `@apify/log` instance (e.g. a `child()` with a custom prefix), wrap it in the `ApifyLogAdapter` from `@crawlee/core`:

```ts
// v3
import { CheerioCrawler, log } from 'crawlee';

const crawler = new CheerioCrawler({
    log: log.child({ prefix: 'MyCrawler' }),
});

// v4
import { ApifyLogAdapter, CheerioCrawler, log } from 'crawlee';

const crawler = new CheerioCrawler({
    logger: new ApifyLogAdapter(log.child({ prefix: 'MyCrawler' })),
});
```

Related: `crawler.log` and the crawling context `log` are typed as `CrawleeLogger`, which has no `setLevel()` method - level filtering belongs to the underlying logging library. With the default logger, set the level on the global `@apify/log` instance instead:

```ts
// v3
crawler.log.setLevel(LogLevel.DEBUG);

// v4
import log, { LogLevel } from '@apify/log';
log.setLevel(LogLevel.DEBUG);
```

### The `utils` bag is removed from the `crawlee` meta-package

The `crawlee` meta-package exported a `utils` object — the last remnant of v2's `Apify.utils` namespace — bundling `utils.puppeteer`, `utils.playwright`, `utils.log`, `utils.enqueueLinks`, `utils.social`, `utils.sleep`, `utils.downloadListOfUrls` and `utils.parseOpenGraph`. It is gone. Every member except `utils.enqueueLinks` was already exported from `crawlee` under its own name, so the fix is to import that name directly. The standalone `enqueueLinks()` is removed too; use `context.enqueueLinks()` in a request handler or `addRequests()` for known URLs:

**Before:**
```typescript
import { utils } from 'crawlee';

await utils.puppeteer.saveSnapshot(page);
await utils.playwright.blockRequests(page);
utils.log.info('hello');
await utils.sleep(1000);
const emails = utils.social.emailsFromText(text);
const urls = await utils.downloadListOfUrls({ url });
const og = await utils.parseOpenGraph(html);
```

**After:**
```typescript
import {
    puppeteerUtils,
    playwrightUtils,
    log,
    sleep,
    social,
    downloadListOfUrls,
    parseOpenGraph,
} from 'crawlee';

await puppeteerUtils.saveSnapshot(page);
await playwrightUtils.blockRequests(page);
log.info('hello');
await sleep(1000);
const emails = social.emailsFromText(text);
const urls = await downloadListOfUrls({ url });
const og = await parseOpenGraph(html);
```

Inside a request handler you usually do not need the namespaces at all — `saveSnapshot`, `blockRequests`, `parseWithCheerio`, `infiniteScroll` and friends are already on the crawling context, pre-bound to the current page.

### `*Finished*` request counters are renamed to `*Succeeded*`

A failed request is also finished, so counters that only ever counted the successful ones were misleading. The rename covers `StatisticState` (`crawler.statistics.state`), the `CalculatedStatistics` returned by `crawler.statistics.calculate()` - which is also what the periodic statistics log line reports - the `FinalStatistics` returned by `crawler.run()`, and the record persisted under `CRAWLEE_CRAWLER_STATISTICS_*`:

- `requestsFinished` -> `requestsSucceeded`
- `requestsFinishedPerMinute` -> `requestsSucceededPerMinute`
- `requestTotalFinishedDurationMillis` -> `requestTotalSucceededDurationMillis`
- `requestAvgFinishedDurationMillis` -> `requestAvgSucceededDurationMillis`

Tooling that reads the persisted record needs the same rename applied. `crawlerFinishedAt` is unchanged - the crawler really does finish.

### Crawler constructors no longer take a `Configuration` argument

The crawler classes dropped the optional second `config?: Configuration` constructor parameter: `PlaywrightCrawler`, `PuppeteerCrawler`, and `AdaptivePlaywrightCrawler` (the same applies to the other crawlers, which never advertised it publicly). `AdaptivePlaywrightCrawler` additionally now extends `BasicCrawler` rather than `PlaywrightCrawler`. Pass a `Configuration` via the `configuration` option instead (see [Using per-crawler services](#using-per-crawler-services-recommended)).

**Before:**
```typescript
const crawler = new PlaywrightCrawler({ requestHandler }, new Configuration({ headless: false }));
```

**After:**
```typescript
const crawler = new PlaywrightCrawler({
    requestHandler,
    configuration: new Configuration({ headless: false }),
});
```

`PuppeteerLauncher` keeps its `(launchContext?, configuration?)` constructor signature — this change is only about the crawler classes. `PlaywrightLauncher` is no longer exported at all, see [`PlaywrightLauncher` is no longer exported](./browser-management.md#playwrightlauncher-is-no-longer-exported).

### Configuration class redesign

The `Configuration` class has been redesigned for v4. The main changes are:

#### Direct property access replaces `get()` and `set()`

**Before:**
```typescript
const config = Configuration.getGlobalConfig();
config.set('persistStateIntervalMillis', 10_000);
const headless = config.get('headless');
```

**After:**
```typescript
// Configuration is now immutable — set options via the constructor
const config = new Configuration({ persistStateIntervalMillis: 10_000 });
const headless = config.headless;
```

The `get()` and `set()` methods are removed. Access config values directly as properties.
Configuration instances are immutable — attempting to assign a property throws a `TypeError`.

#### Constructor options now take precedence over environment variables

**New priority order (highest to lowest):**
1. Constructor options
2. Environment variables
3. `crawlee.json`
4. Schema defaults

Previously, environment variables always won. Now `new Configuration({ headless: false })`
works even when `CRAWLEE_HEADLESS=true` is set.

### `KeyValueStore.getInput()` and `Configuration.inputKey` moved to the Apify SDK

Reading the run input is an Apify platform concern, so Crawlee no longer has any notion of it:

- **`KeyValueStore.getInput()` is removed.** Use `Actor.getInput()` from `apify`, which also handles the platform-assigned input key, encrypted secrets and input schema defaults.
- **`Configuration.inputKey` and the `CRAWLEE_INPUT_KEY` environment variable are removed.** The Apify SDK's `Configuration` defines `inputKey` itself.
- **The default key-value store is purged in full**, `INPUT` included. Sparing a key, and claiming a bare `<key>` / `<key>.json` file as the record `<key>` (see [Out-of-band key-value files](#out-of-band-key-value-files-eg-a-hand-placed-inputjson)), is left to subclasses of `FileSystemStorageBackend` through its two protected hooks, `keyValueStoreAdoptionCandidates` and `purgeKeyValueStore`. The Apify SDK's `ApifyFileSystemStorageBackend` does this for its run input; plain Crawlee treats a hand-placed `INPUT.json` as any other file.

### Service management moved from `Configuration` to `ServiceLocator`

The service management functionality has been extracted from `Configuration` into a new `ServiceLocator` class.

#### Breaking changes

The following methods and properties have been removed from `Configuration`:

- `Configuration.getStorageClient()` - moved to `ServiceLocator.getStorageBackend()`
- `Configuration.getEventManager()` - moved to `ServiceLocator.getEventManager()`
- `Configuration.useStorageClient()` - use `ServiceLocator.setStorageBackend()` instead
- `Configuration.useEventManager()` - use `ServiceLocator.setEventManager()` instead
- `Configuration.resetGlobalState()` - use `serviceLocator.reset()` instead. The method is marked `@internal`: it exists at runtime and is the supported way to tear down global state between tests, but it is not part of the public API and may change without a major version bump.
- `Configuration.storageManagers` - use `serviceLocator.getStorageInstanceManager()` instead. Also marked `@internal` - available at runtime, but excluded from the documented surface and not covered by semver guarantees. Application code should reach storages through `Dataset.open()` / `KeyValueStore.open()` / `RequestQueue.open()` rather than the instance manager.

The `EventManager` and `LocalEventManager` constructors now accept an options object for configuring event intervals (e.g. `persistStateIntervalMillis`, `systemInfoIntervalMillis`). You can also use the new `LocalEventManager.fromConfiguration()` factory method to create an instance with intervals derived from a `Configuration` object.

#### Migration guide

If you were using the removed `Configuration` methods directly, you need to update your code:

**Before:**
```typescript
import { Configuration } from 'crawlee';

const config = Configuration.getGlobalConfig();
const storageBackend = config.getStorageClient();
const eventManager = config.getEventManager();

// or static methods
const storageBackend = Configuration.getStorageClient();
// (both of these are the removed v3 APIs)
```

**After:**
```typescript
import { serviceLocator } from 'crawlee';

const storageBackend = serviceLocator.getStorageBackend();
const eventManager = serviceLocator.getEventManager();
```

#### Using per-crawler services (recommended)

The new `ServiceLocator` supports per-crawler service isolation, allowing you to use different storage backends or event managers for different crawlers by passing them via options:

```typescript
import { BasicCrawler, Configuration, LocalEventManager, MemoryStorageBackend } from 'crawlee';

const crawler = new BasicCrawler({
    requestHandler: async ({ request, log }) => {
        log.info(`Processing ${request.url}`);
    },
    configuration: new Configuration({ headless: false }),
    storageBackend: new MemoryStorageBackend(),
    eventManager: LocalEventManager.fromConfiguration(),
});

await crawler.run(['https://example.com']);
```

#### Using the global service locator

For most use cases, the global `serviceLocator` singleton works well:

```typescript
import { serviceLocator, BasicCrawler, MemoryStorageBackend } from 'crawlee';

// Configure global services (optional)
serviceLocator.setStorageBackend(new MemoryStorageBackend());

// All crawlers will use the global service locator by default
const crawler = new BasicCrawler({
    requestHandler: async ({ request, log }) => {
        log.info(`Processing ${request.url}`);
    },
});
```

#### Accessing configuration

`Configuration.getGlobalConfiguration()` remains as a utility function, but in most cases, you should use `serviceLocator.getConfiguration()` instead:

```typescript
import { serviceLocator } from 'crawlee';

const config = serviceLocator.getConfiguration();
```

Despite its name, `getGlobalConfiguration()` returns the configuration of the currently active service locator, which is not always the global one — prefer `serviceLocator.getConfiguration()`.

#### `config` is renamed to `configuration` everywhere

v3 used `config` and `configuration` interchangeably. v4 settles on `configuration`.

Renamed methods:

| Before | After |
| --- | --- |
| `Configuration.getGlobalConfig()` | `Configuration.getGlobalConfiguration()` |
| `LocalEventManager.fromConfig()` | `LocalEventManager.fromConfiguration()` |

Renamed options — pass `configuration` instead of `config`:

- `Dataset.open()`, `KeyValueStore.open()` and `RequestQueue.open()` (`StorageOpenOptions`)
- `useState()` (`UseStateOptions`)
- `purgeDefaultStorages()` (both the options object and the legacy positional argument)
- `saveSnapshot()` in `@crawlee/playwright` and `@crawlee/puppeteer` (`SaveSnapshotOptions`)
- `RecoverableStateOptions`, `RequestListOptions`, `CpuLoadSignalOptions` and `MemoryLoadSignalOptions`

**Before:**
```typescript
const store = await KeyValueStore.open(null, { config: new Configuration({ persistStorage: false }) });
```

**After:**
```typescript
const store = await KeyValueStore.open(null, { configuration: new Configuration({ persistStorage: false }) });
```

Renamed properties — `Dataset.config`, `KeyValueStore.config` and `BrowserLauncher.config` (including `PuppeteerLauncher`) are now `.configuration`.

The `configuration` crawler option is unchanged, as are `serviceLocator.getConfiguration()` and `serviceLocator.setConfiguration()`.

### Navigation and the request handler are timed separately

In v3, navigation ran inside the request handler's time window, and the two options were summed (plus an undocumented 10 second buffer) to form the actual limit. Setting `requestHandlerTimeoutSecs: 60` on a `PlaywrightCrawler` therefore produced errors complaining about 130 seconds.

Navigation and the request handler are now timed independently, and each reports itself:

| Option | Covers | Default |
| --- | --- | --- |
| `requestHandlerTimeoutSecs` | your `requestHandler` only | 60 |
| `navigationTimeoutSecs` | the `preNavigationHooks`, the navigation, and the `postNavigationHooks` together | 30 (HTTP), 60 (browser) |

`navigationTimeoutSecs` is a single budget shared by the whole navigation phase, so a slow hook eats into the same window the navigation uses.

Two things to watch for when upgrading:

- **Navigation hooks are now bounded.** They had no timeout of their own before, so a `preNavigationHooks` / `postNavigationHooks` function that pushes the whole phase past `navigationTimeoutSecs` will now fail the request. Raise `navigationTimeoutSecs`, or call `context.extendTimeout()` from inside the hook when the extra time is only needed occasionally.
- **A request can no longer hang forever.** An internal timeout now bounds the whole request, covering the phases that have no timeout of their own (`extendContext`, the robots.txt check, response processing). By default it is deliberately generous (twice the request handler timeout, and never less than 5 minutes), so it only fires when a request is genuinely stuck. Set `CRAWLEE_INTERNAL_TIMEOUT` (in milliseconds) to override it. A value below the navigation and request handler timeouts is ignored — the crawler warns at startup and keeps the timeout above them so those phases are never cut short.

### Per-route and per-request handler timeouts

`requestHandlerTimeoutSecs` still applies to every request alike, but a single route can now opt out of it — useful when one page type needs markedly more time than the rest, and you do not want to raise the timeout for everything else to accommodate it:

```typescript
router.addHandler('LIST', async ({ enqueueLinks }) => { ... }, { requestHandlerTimeoutSecs: 120 });
router.addHandler('DETAIL', async ({ pushData }) => { ... }); // keeps the crawler's default
```

When the time needed is only apparent once the handler is already running, `context.extendTimeout()` buys it more:

```typescript
router.addHandler('LIST', async ({ page, extendTimeout }) => {
    const pageCount = await countPages(page);
    extendTimeout(pageCount * 10);
    await scrapeAllPages(page);
});
```

### `useSessionPool` and `sessionPoolOptions` are removed

The `useSessionPool` and `sessionPoolOptions` options have been removed from the `BasicCrawler` constructor. Every crawler now uses a `SessionPool` by default. Instead of passing `sessionPoolOptions`, create a `SessionPool` instance directly and pass it via the `sessionPool` option.

```typescript
import { SessionPool } from '@crawlee/basic';

const crawler = new BasicCrawler({
    // The old parameters won't work anymore
    // useSessionPool: true,
    // sessionPoolOptions: { maxUsageCount: 5 },
    sessionPool: new SessionPool({
        sessionOptions: { maxUsageCount: 5 },
    }),
});
```

### `SessionPool` is now lazy-initialized

`SessionPool.open()` static factory method is removed. Create instances with `new SessionPool(options)` instead — all public methods automatically initialize the pool on first use.

`SessionPool.usableSessionsCount` and `SessionPool.retiredSessionsCount` are now async methods instead of synchronous getters.

**Before:**
```typescript
const sessionPool = await SessionPool.open({ maxPoolSize: 100 });
const count = sessionPool.usableSessionsCount;
```

**After:**
```typescript
const sessionPool = new SessionPool({ maxPoolSize: 100 });
const count = await sessionPool.usableSessionsCount();
```

### `SessionPool.persistState()`, `resetStore()` and `teardown()` no longer take options

The `PersistenceOptions` argument of `persistState()` and `resetStore()` and the `{ persistState }` argument of `teardown()` are removed. Neither had any effect, so there is nothing to replace them with.

`resetStore()` now throws while the pool is running, since the next periodic write would put the record straight back. Call `teardown()` first, or use the new `reset()` to discard the in-memory sessions instead.

### `RequestList` prefers the persisted record over the `state` option

With both `state` and `persistStateKey` set, the record now wins. Previously `state` did. The option is also validated up front: `nextIndex` must be a non-negative integer and `inProgress` an array of unique keys. The `@internal` `isStatePersisted` flag is gone.

Both `SessionPool` and `RequestList` now persist through `RecoverableState`, like `Statistics`. The persisted records keep their shape, but `RequestList` stores them under a different key: the prefix added to `persistStateKey` and `persistRequestsKey` (and to the keys derived from `RequestList.open(name)`) changed from `SDK_` to `CRAWLEE_`. A v3 run's record is therefore not found and the list restarts from the beginning. To carry an in-flight crawl across the upgrade, finish it first or copy the records to the `CRAWLEE_` keys.

### `retireOnBlockedStatusCodes` is removed from `Session`

`Session.retireOnBlockedStatusCodes` is removed. Blocked status code handling is now internal to the crawler. Configure blocked status codes via the `blockedStatusCodes` crawler option (moved from `sessionPoolOptions`).

### `maxSessionRotations` and `request.sessionRotationCount` are removed

Session errors no longer have their own retry budget. The `maxSessionRotations` crawler option, the `Request.sessionRotationCount` property, and the special-case retry logic for `SessionError` are all gone. A `SessionError` now retires the session and counts toward `maxRequestRetries` like any other failure, so configure a single retry limit via `maxRequestRetries` (default `3`). `SessionError` also no longer extends `RetryRequestError` — if you were catching `RetryRequestError` to detect a session-triggered retry, branch on `SessionError` directly instead.

### Cookie handling in `HttpCrawler` and `sendRequest`

Cookie handling was refactored to be simpler and more predictable. The `BaseHttpClient` is now the single place where the `Cookie` request header is assembled, by merging cookies from the session's cookie jar with any `Cookie` header already present on the request. Explicit `Cookie` headers take precedence over jar cookies with the same name.

This means `sendRequest` now respects user-provided cookies. In v3, passing a `Cookie` header via `sendRequest` headers was silently overwritten by the session's cookie jar — this is no longer the case.

The precedence (highest to lowest) is:

1. `sendRequest` `Cookie` header and `cookieJar` overrides
2. `Cookie` header set directly on the request (via `request.headers`)
3. Session cookie jar (persisted cookies received from `Set-Cookie` response headers or set manually)

To fully replace the cookie jar for a `sendRequest` call, pass a custom `cookieJar` in the options:

```typescript
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();
await jar.setCookie('my=cookie', request.url);
const response = await sendRequest({ url: '...' }, { cookieJar: jar });
```

The protected `HttpCrawler._applyCookies` method is removed. If you were overriding it in a subclass, move your logic to a `preNavigationHook` that sets cookies on `request.headers.Cookie` or on the `session` cookie jar directly.

`mergeCookies` now skips malformed cookie fragments with a warning instead of throwing.

#### `Session.getCookies`, `setCookies` and `setCookiesFromResponse` are removed

The public cookie helper methods on `Session` — `getCookies(url)`, `setCookies(cookies, url)`, and `setCookiesFromResponse(response)` — have been removed as part of centralizing cookie assembly in `BaseHttpClient`. Work with the session's `cookieJar` directly, or use the new async `Session.getCookieString(url)` to read the assembled `Cookie` header value.

**Before:**
```typescript
const cookies = session.getCookies(url);
session.setCookies([{ name: 'foo', value: 'bar' }], url);
session.setCookiesFromResponse(response);
```

**After:**
```typescript
// Read the Cookie header string for a URL:
const cookieHeader = await session.getCookieString(url);

// Set / read cookies via the jar directly:
await session.cookieJar.setCookie('foo=bar', url);
const cookieHeader2 = await session.cookieJar.getCookieString(url);
```

### `persistCookiesPerSession` renamed to `saveResponseCookies`

The `persistCookiesPerSession` crawler option has been renamed to `saveResponseCookies` on both `HttpCrawler` (and its subclasses like `CheerioCrawler`, `JSDOMCrawler`, etc.) and `BrowserCrawler`. When enabled (the default), response cookies are stored in the session's cookie jar so they're sent on subsequent requests using the same session. Rename the option in your crawler constructor options to migrate.

### Browser cookies are also persisted after `requestHandler`

Previously, `BrowserCrawler` with `saveResponseCookies` (formerly `persistCookiesPerSession`) only copied cookies from the page into the session after navigation and **before** `requestHandler` ran. Cookies set during the handler — login flows, `page.setCookie()`, or XHR/`fetch` `Set-Cookie` responses — were not stored on the session for later requests.

In v4, when `saveResponseCookies` is enabled (the default), browser cookies are also re-read and stored in the session cookie jar **after** `requestHandler` completes. If you relied on handler-set cookies staying page-local and not affecting later requests on the same session, set `saveResponseCookies: false` or clear/overwrite cookies on the session explicitly.

### `browserPoolOptions` is removed

`browserPoolOptions` is gone from every browser crawler. It was a second way of configuring the very pool that the `browserPool` option accepts, and the two could not be combined — passing a pool made the options silently disappear.

Build the pool with the factory that matches your crawler instead. Each factory takes every `BrowserPool` option plus the crawler's own `launchContext`, `headless` and `remoteBrowser`, and derives the browser plugin from them, so the pool can never mismatch the crawler it is passed to:

| crawler | factory |
| --- | --- |
| `PlaywrightCrawler` | `playwrightBrowserPool()` |
| `PuppeteerCrawler` | `puppeteerBrowserPool()` |
| `StagehandCrawler` | `stagehandBrowserPool()` |

**Before:**
```typescript
const crawler = new PlaywrightCrawler({
    browserPoolOptions: { useFingerprints: false },
    launchContext: { launcher: firefox },
});
```

**After:**
```typescript
const crawler = new PlaywrightCrawler({
    browserPool: playwrightBrowserPool({
        useFingerprints: false,
        launchContext: { launcher: firefox },
    }),
});
```

Building the pool outside the crawler has one consequence worth knowing: a pool passed as `browserPool` is borrowed, so the crawler never destroys it, and the options that would have configured a pool of the crawler's own — `launchContext`, `headless`, `remoteBrowser` and, for `StagehandCrawler`, `stagehandOptions` — are now **rejected** instead of silently ignored. Move them into the factory call.

`remoteBrowser` keeps working on its own for the terse case; pass the same `remoteBrowser` to the factory when you also want to tune the pool, or to share one remote pool between crawlers. Remote connections are owned by the `RemotePlaywrightPlugin` / `RemotePuppeteerPlugin` classes from `@crawlee/browser-pool` — there is no separate `RemoteBrowserPool`; `BrowserPool` itself accepts `maxOpenBrowsers`. `StagehandCrawler` does not support `remoteBrowser` (it throws) — Stagehand manages its own browser via `stagehandOptions.env`.

`headless` is now declared on each concrete crawler rather than on `BrowserCrawler`, so the puppeteer-only `'new'` and `'old'` values are only accepted by `PuppeteerCrawler`.

### `ignoreSslErrors` is renamed to `ignoreTlsErrors`

The crawler option is renamed to `ignoreTlsErrors`, matching the naming used everywhere else in v4 (`session.proxyInfo.ignoreTlsErrors`, the browser pool, the impit client). The old `ignoreSslErrors` name is no longer accepted — rename it in your crawler options. Behavior is unchanged from v3 for the HTTP crawlers: the option defaults to `true` and they accept invalid TLS certificates by default. `FileDownload` is the exception; see [its section](#filedownload-now-extends-basiccrawler-and-no-longer-takes-filedownloadoptions).

Under the hood the crawler now forwards the option to the HTTP client as `SendRequestOptions.ignoreTlsErrors` on every navigation request, and the same flag is enabled automatically for MITM proxy sessions (`session.proxyInfo.ignoreTlsErrors`), matching the browser crawlers.

This only affects custom `BaseHttpClient` implementations: honor `ignoreTlsErrors` (from `SendRequestOptions`, or `CustomFetchOptions` when extending the `BaseHttpClient` class from `@crawlee/http-client`) if your client can disable TLS verification. The built-in impit and got-scraping clients do; the native fetch fallback cannot, so it warns and ignores the flag.

### `preNavigationHooks` in `HttpCrawler` no longer accepts `gotOptions` object

The `preNavigationHooks` option in `HttpCrawler` subclasses no longer accepts the `gotOptions` object as a second parameter. Modify the `crawlingContext` fields (e.g. `.request`) directly instead.

### Browser navigation hooks no longer receive `gotoOptions` as a second argument

The `preNavigationHooks` and `postNavigationHooks` of the browser crawlers (`PlaywrightCrawler`, `PuppeteerCrawler`) received the options object forwarded to `page.goto()` as a second parameter in v3. The hooks now receive only the crawling context, and the `page.goto()` options are available as its `gotoOptions` member, which can be mutated in place:

```ts
// v3
preNavigationHooks: [
    async (crawlingContext, gotoOptions) => {
        gotoOptions.timeout = 60_000;
    },
],

// v4
preNavigationHooks: [
    async ({ gotoOptions }) => {
        gotoOptions.timeout = 60_000;
    },
],
```

### `handleCloudflareChallenge` hooks must return the response

In v3, calling `handleCloudflareChallenge()` in a `postNavigationHooks` entry was enough on its own - the helper received the session and removed `403` from the session pool's blocked status codes, so the challenge page (which is served with a 403 status) did not trip the blocked-request detection.

In v4, blocked status code handling is internal to the crawler and runs *after* the post-navigation hooks, and the helper no longer touches it. Instead, `handleCloudflareChallenge()` returns the reloaded `Response` after solving the challenge, and the hook must return it as the new context response - otherwise the crawler still sees the original 403 challenge response and throws a `SessionError` before your `requestHandler` runs, even when the challenge was solved successfully.

Use the pre-wrapped `handleCloudflareChallengeHook()` (it also handles the no-challenge case), or return the response yourself:

```ts
// v3
postNavigationHooks: [
    async ({ handleCloudflareChallenge }) => {
        await handleCloudflareChallenge();
    },
],

// v4
import { handleCloudflareChallengeHook } from 'crawlee';

postNavigationHooks: [handleCloudflareChallengeHook()],

// v4 (manual equivalent)
postNavigationHooks: [
    async ({ handleCloudflareChallenge }) => {
        // Returning `{ response: undefined }` would clobber the navigation response
        // when there was no challenge, so only return it when one was solved.
        const response = await handleCloudflareChallenge();
        return response && { response };
    },
],
```

If you called the standalone `playwrightUtils.handleCloudflareChallenge(page, url, session, options)` directly, note that the `session` parameter is gone - the v4 signature is `handleCloudflareChallenge(page, url, options)`, so an options object passed in the old fourth position would be silently ignored.

### Removed crawling context properties

#### Crawling context no longer includes Error for failed requests

The crawling context no longer includes the `Error` object for failed requests. Use the second parameter of the `errorHandler` or `failedRequestHandler` callbacks to access the error.

#### Crawling context no longer includes a reference to the crawler itself

This was previously accessible via `context.crawler`. If you want to restore the functionality, you may use the `extendContext` option of the crawler:

```typescript
const crawler = new CheerioCrawler({
  extendContext: () => ({ crawler }),
  requestHandler: async (context) => {
    if (Math.random() < 0.01) {
      context.crawler.stop()
    }
  }
})
```

`extendContext` runs **before navigation**, so the members it returns are visible to the `preNavigationHooks`, `postNavigationHooks`, and the `requestHandler` alike. As a consequence, the `context` passed to `extendContext` is the pre-navigation context and does **not** include navigation-dependent members (e.g. `page`, `response`, `$`, `body`). If your extension needs to read those, do it in a `postNavigationHook` or the `requestHandler` instead.

#### Crawling context no longer includes `closeCookieModals`

The `closeCookieModals` context helper is removed from the Playwright and Puppeteer crawlers, along with the `playwrightUtils.closeCookieModals` / `puppeteerUtils.closeCookieModals` functions and the optional `idcac-playwright` peer dependency they were built on.

See the [cookie modals guide](../guides/cookie-modals) for the replacements, including a drop-in `preNavigationHook` built on `@duckduckgo/autoconsent`.

### Crawling context is strictly typed

Previously, the crawling context extended a `Record` type, allowing to access any property. This was changed to a strict type, which means that you can only access properties that are defined in the context.

### The default HTTP client is now `impit`

The HTTP crawlers (and `sendRequest`) no longer use `got-scraping` by default. The default client is now `ImpitHttpClient` from the optional `@crawlee/impit-client` package (a Rust-based client with TLS fingerprint impersonation); when it is not installed, the crawlers fall back to a plain `fetch`-based client with a logged warning (no proxy support or impersonation). To keep using `got-scraping`, install `@crawlee/got-scraping-client` and pass `httpClient: new GotScrapingHttpClient()` explicitly.

Note that the session's fingerprint drives the impersonation: each new session gets a randomized realistic fingerprint by default, and its `browser` hint overrides the `browser` option passed to the `ImpitHttpClient` constructor. To force a specific browser family, pin the fingerprint on the sessions instead:

```ts
const crawler = new CheerioCrawler({
    httpClient: new ImpitHttpClient({ browser: Browser.Firefox }),
    sessionPool: new SessionPool({
        createSessionFunction: async (opts) =>
            new Session({
                ...opts?.sessionOptions,
                fingerprint: { browser: 'firefox', platform: 'linux', device: 'desktop' },
            }),
    }),
});
```

See the [Avoid getting blocked](https://crawlee.dev/js/docs/guides/avoid-blocking) guide for how the session fingerprint interacts with both HTTP and browser crawlers.

### `HttpClient` instances return `Response` objects

The interface of `HttpClient` instances was changed to return the [native `Response` objects](https://developer.mozilla.org/en-US/docs/Web/API/Response) instead of custom `HttpResponse` objects.

### `CrawlingContext.response` is now of type `Response`

The `CrawlingContext.response` property is now of type [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) instead of `HttpResponse`. `CrawlingContext.sendRequest` method now returns `Response` objects as well.

### Multiple crawler instances use separate default request queues

In v3, every `BasicCrawler` (or subclass) that didn't receive an explicit `requestQueue` option would open the same default request queue. If you created two crawlers in the same process, they would silently share a queue — leading to request collisions and hard-to-debug deduplication issues.

In v4, only the **first** crawler instance uses the default request queue. Each subsequent instance automatically gets its own queue via an internal alias (e.g. `__default_1__`, `__default_2__`, etc.). This means multiple crawlers can safely coexist without interfering with each other's requests.

If you explicitly pass a `requestQueue` (or `requestManager`) to the crawler, that queue is used as-is regardless of instance order.

### Repeated `run()` calls no longer empty the request queue

In v3, calling `crawler.run()` again on the same instance dropped the default request queue and created a fresh one, so the same URLs were crawled again — but only for a queue actually named `default`, which the Apify platform's default queue is not, so on the platform the second run silently crawled nothing.

v4 does the same thing everywhere: nothing is emptied between runs. A repeated `run()` continues with the same request manager, and requests the previous run handled — a failed request counts as handled — are not processed again. Any crawl that ends up processing nothing while its request manager holds only handled requests warns and says why, instead of finishing silently; that also covers a second crawler sharing the queue, or a queue a previous process already worked through.

The `purgeRequestQueue` option of `crawler.run()` went away with the automatic purge. To crawl the same requests again, empty the queue yourself:

```typescript
const crawler = new BasicCrawler({ requestHandler: async ({ request }) => { /* ... */ } });
await crawler.run(['https://example.com/a', 'https://example.com/b']);

const requestManager = await crawler.getRequestManager();
await requestManager.purge?.();

// The same URLs are crawled again:
await crawler.run(['https://example.com/a', 'https://example.com/c']);
```

`purge()` — empty the storage, keep its id and name — is new in v4 and available on `Dataset`, `KeyValueStore` and `RequestQueue`, as well as being an optional method on the `IRequestManager` interface. The Apify platform is the exception. Its API has no in-place empty, so all three throw there. The error points you at `drop()` or a fresh storage.

This has nothing to do with `purgeOnStart` / `CRAWLEE_PURGE_ON_START`, which still wipes the default storages once per process before the first run.

Most of the time you can avoid the purge entirely. Every crawler instance opens a request queue of its own (see the section above). A crawler per crawl therefore needs neither a purge nor any queue wiring. Pass `RequestQueue.open({ alias })` when you do want to hold on to that queue:

```typescript
for (const [index, urls] of batches.entries()) {
    const crawler = new BasicCrawler({
        // Optional — a fresh crawler gets its own queue anyway. Pass one to decide which.
        requestManager: await RequestQueue.open({ alias: `batch-${index}` }),
        requestHandler: async ({ request }) => { /* ... */ },
    });

    await crawler.run(urls);
}
```

An alias identifies a run-scoped queue. It has no persistent name, and is emptied on start along with the default storages. Reuse an alias and you get that same queue back, handled requests included. The next crawl then finds nothing to do. Give each crawl its own alias. `purge()` is for when one crawler and one queue must be reused.

### `teardown()` is per-run, disposing of the crawler is not

`crawler.teardown()` ends the run in progress and releases only what that run owns — it is what `run()` calls on its way out. In v3 it also destroyed the browser pool a browser crawler had built for itself, and a destroyed `BrowserPool` cannot be used again: with its timers cleared and its listeners dropped, a second `run()` had nothing retiring idle browsers or reaping the retired ones. It now releases that run's browsers and leaves the pool usable.

What outlives a run is released by `crawler.destroy()`, or by disposing of the crawler:

```typescript
{
    await using crawler = new PlaywrightCrawler({ requestHandler: async ({ page }) => { /* ... */ } });

    await crawler.run(['https://example.com/a']);
    await crawler.run(['https://example.com/b']);
} // the browser pool is destroyed here, as the crawler goes out of scope
```

Disposing is optional — a finished run leaves no browsers open and no timer holding the process alive.

:::info

The `await using` syntax needs Node.js 24 or later. On Node.js 22 call <ApiLink to="basic-crawler/class/BasicCrawler#destroy">`destroy()`</ApiLink> yourself instead — it is what the disposal hook calls anyway, as with the [collaborators you own](#collaborators-you-own-are-disposable).

:::

`crawler.running` is now a read-only getter; in v3 it was an assignable field.

### Storage `.open()` now also accepts `{ id?, name? }`

`Dataset.open()`, `KeyValueStore.open()`, and `RequestQueue.open()` previously accepted a single `idOrName?: string` parameter. This was ambiguous — callers couldn't express whether they were opening a storage by its ID or by name.

The first parameter now also accepts a `StorageIdentifier` object with separate `id` and `name` fields:

```typescript
interface StorageIdentifier {
    id?: string;
    name?: string;
}
```

Passing a plain string still works — it is first looked up as an ID, and if no such storage exists, it is treated as a name (matching the v3 behavior):

```typescript
const dataset = await Dataset.open('my-dataset');
const store = await KeyValueStore.open('my-store');
const queue = await RequestQueue.open('my-queue');
```

You can also use the object form, which additionally allows opening a storage by ID:

```typescript
const dataset = await Dataset.open({ name: 'my-dataset' });

// Opening by ID (e.g. on the Apify platform):
const dataset = await Dataset.open({ id: 'WkzbQMuFYuamGv3YF' });
```

Opening the default storage (no arguments or `null`) still works as before:

```typescript
const dataset = await Dataset.open();
```

The same change applies to `CrawlingContext.getKeyValueStore()` and `CrawlingContext.pushData()` — both now accept `string | StorageIdentifier` for identifying the target storage.

### Storage writes in request handlers are transactional

Every crawler now wraps each request in a **storage transaction** (see the [Transactional storage](../guides/result-storage#transactional-storage) section of the Result Storage guide): storage writes made anywhere in the request lifecycle — hooks, `extendContext` and the request handler alike — are recorded and only applied to real storage when the request handler succeeds. A handler that throws leaves no partial writes behind, and a retry does not duplicate data.

The observable behavior of a *successful* handler is unchanged (reads within a handler see its own writes), but several things differ on the failure path and around handler boundaries:

- **Uncommitted writes are invisible to other handlers.** Using the key-value store as a live channel between concurrently running handlers no longer works — one handler's `setValue()` only becomes visible to others once its request succeeds. Use `useState()` for cross-handler communication.
- **`useState()` / `getAutoSavedValue()` are *not* transactional.** The shared state object stays live; mutations of it are not rolled back when a handler fails. Side effects that have to match the writes that actually landed — result counters above all — belong in a callback registered with the new `afterStorageCommit()` context helper.
- **Request queue additions are applied immediately by default** (the `writeThrough` policy) and are not rolled back — deduplication by `uniqueKey` keeps retries idempotent. Pass `transactionalStorage: { requestQueue: 'deferred' }` for strict all-or-nothing enqueues.
- **Commit is at-least-once.** It spans multiple storages, so a commit that fails partway fails the request; the retry may re-apply writes that already landed.
- **A write cannot fail where it is made.** `pushData()` records the item and returns; if the storage backend rejects it, that happens at commit time, and a `try`/`catch` around the call never sees it. Register an `afterStorageCommit()` callback next to the write instead — it receives the commit error, and an error it throws replaces it, so a rejected write can still be turned into a `NonRetryableError` of your own.
- **`KeyValueStore.setValue()` with a stream value throws inside a request handler.** A stream can only be consumed once, so it cannot be buffered. Wrap the call in `withDirectStorageAccess()` to write it immediately:

  ```typescript
  import { withDirectStorageAccess } from 'crawlee';

  await withDirectStorageAccess(async () => keyValueStore.setValue('video', stream, { contentType: 'video/mp4' }));
  ```

- **`drop()`, `purge()` and the request queue processing internals throw inside a request handler**, since no rollback could undo them. `withDirectStorageAccess()` is the escape hatch there, too.
- **Key listing order changes inside a handler**: `keys()`, `values()` and `entries()` emit the handler's own (buffered) keys first, then the rest.

The mechanism can be disabled entirely with `transactionalStorage: false` on any crawler except `AdaptivePlaywrightCrawler` (which needs it to discard the writes of its losing request handler attempts).

#### Removed symbols and options

- `checkStorageAccess` and `withCheckedStorageAccess` are superseded by the transaction mechanism; the per-call-site helper is now `withDirectStorageAccess()`.
- The experimental `AdaptivePlaywrightCrawler` no longer needs its bespoke write-buffering machinery: the `preventDirectStorageAccess` option is gone (direct storage calls are now captured by the per-attempt transaction instead of throwing), and `RequestHandlerResult` is replaced by the read-only `StorageTransactionView`, which the `resultChecker` / `resultComparator` callbacks (and `fullResultComparator`) now receive. The view keeps the familiar accessors (`datasetItems`, `enqueuedUrls`, `keyValueStoreChanges`), so most callbacks only need a type change. The `calls` and `enqueuedUrlLists` accessors are gone — `requestsFromUrl` sources are now expanded when added, so the fetched URLs appear in `enqueuedUrls` (and are what `fullResultComparator` compares). The `commitResult` override point is gone too; use an `afterStorageCommit()` callback to run logic once the winning attempt's writes have landed (or failed to).

### `storageObject` is removed from storage classes

The `storageObject` property (the raw backend record exposed on `Dataset`, `KeyValueStore` and `RequestQueue` instances) is removed. The commonly used fields are available directly on the instance as `id` and `name`, and `Dataset.getInfo()` returns the full metadata:

```ts
// v3
const { id, name } = dataset.storageObject;

// v4
const { id, name } = dataset;
const info = await dataset.getInfo();
```

### `KeyValueStore.getPublicUrl` is now async

The `KeyValueStore.getPublicUrl` method is now asynchronous and reads the public URL directly from the storage backend.

### `MemoryStorage` split into `FileSystemStorageBackend` and `MemoryStorageBackend`

In v3, the single `MemoryStorage` class from `@crawlee/memory-storage` did double duty: it kept everything in memory *and*, by default, mirrored it to disk (toggled via the `persistStorage` option / `CRAWLEE_PERSIST_STORAGE` environment variable). In v4 these two responsibilities are split into two independent classes, and the default storage backend now persists to disk.

- **`FileSystemStorageBackend`** (new, in the new `@crawlee/fs-storage` package) — always persists storage to the local directory (`CRAWLEE_STORAGE_DIR`, default `./storage`). This is what you get implicitly when you don't configure a storage backend, and it is the behavior the old `MemoryStorage` had with its default `persistStorage: true`.
- **`MemoryStorageBackend`** (the renamed `MemoryStorage`, now part of `@crawlee/core`) — keeps everything purely in memory and **never touches the disk**. This matches the old `MemoryStorage` with `persistStorage: false`. The standalone `@crawlee/memory-storage` package no longer exists; its code was merged into `@crawlee/core`.

Both classes are re-exported from the `crawlee` meta-package.

#### The default storage backend now persists to disk

Which client backs the implicit default is decided by `Configuration.persistStorage` (still controllable via the `CRAWLEE_PERSIST_STORAGE` environment variable): `true` (the default) selects `FileSystemStorageBackend`, `false` selects `MemoryStorageBackend`. If you relied on the default and never set `persistStorage`, your storage is persisted to disk exactly as before — no change.

#### `MemoryStorage` is renamed and is now memory-only

If you constructed the storage backend explicitly, two things changed:

1. **The class is renamed** `MemoryStorage` → `MemoryStorageBackend`.
2. **It no longer writes to disk.** A bare `new MemoryStorage()` in v3 persisted to disk by default; `new MemoryStorageBackend()` in v4 does not. If you want persistence, use `FileSystemStorageBackend` instead.

**Before:**
```typescript
import { MemoryStorage } from '@crawlee/memory-storage';

// Persisted to disk by default in v3.
const storageBackend = new MemoryStorage();
```

**After:**
```typescript
import { FileSystemStorageBackend } from '@crawlee/fs-storage';
import { MemoryStorageBackend } from '@crawlee/core';

// Persists to disk (the old default behavior):
const storageBackend = new FileSystemStorageBackend({ localDataDirectory: './storage' });

// Or keep everything in memory only (the old `persistStorage: false`):
const inMemory = new MemoryStorageBackend();
```

`MemoryStorageBackend` no longer takes the `localDataDirectory`, `persistStorage`, or `writeMetadata` options — in-memory storage has nowhere to write, so they had no meaning. `FileSystemStorageBackend` honors `localDataDirectory`; it always persists, so it has no `persistStorage` option, and the `writeMetadata` option has been removed there too (see [`writeMetadata` option removed](#writemetadata-option-removed)).

#### No request lock expiry in `MemoryStorageBackend`

Because the in-memory queue lives entirely within a single process and is never shared with another consumer, `MemoryStorageBackend`'s request queue no longer uses an expiring, cross-process lock. A fetched request simply stays *in progress* until it is handled or reclaimed; it never becomes fetchable again on its own after a timeout. `setExpectedRequestProcessingTimeSecs()` is therefore a no-op for in-memory storage. (Disk-backed `FileSystemStorageBackend` keeps the lock-with-expiry behavior.)

#### `writeMetadata` option removed

`FileSystemStorageBackend` no longer accepts the `writeMetadata` option. The underlying file-system storage now always writes metadata files (`__metadata__.json` for each storage and a `<key>.__metadata__.json` sidecar for each key-value record), so the toggle no longer had any effect. Remove it from your storage backend options:

```diff
 import { FileSystemStorageBackend } from '@crawlee/fs-storage';

 const storageBackend = new FileSystemStorageBackend({
     localDataDirectory: './storage',
-    writeMetadata: true,
 });
```

`MemoryStorageBackend` never accepted `writeMetadata` (it has no on-disk format to begin with), so there is nothing to change there.

### Out-of-band key-value files (e.g. a hand-placed `INPUT.json`)

Keys are literal. `aaa` and `aaa.json` are two distinct keys, and `FileSystemStorageBackend` never infers a key from a file's extension — in v3 a hand-placed `aaa.json` was readable as `aaa`, in v4 it is not.

What v4 does instead is *adopt* value files that turn up in a store directory without the `<key>.__metadata__.json` sidecar that marks a record — the Apify CLI's input, a project template, a v3 store directory, a file you dropped in with an editor. Opening the store writes the missing sidecar (the value bytes are never touched), and from then on the file is an ordinary record: read by `getValue`, enumerated by `listKeys`, removed by `deleteValue`. Two rules decide the key:

- A subclass of `FileSystemStorageBackend` may claim specific files under a key of its own by overriding `keyValueStoreAdoptionCandidates`. The Apify SDK's `ApifyFileSystemStorageBackend` claims a bare `INPUT` or `INPUT.json` in the **default** store (and the same for the configured `ACTOR_INPUT_KEY`) as the record `INPUT`: the file keeps its name, `listKeys` reports `INPUT`, `getValue('INPUT.json')` is `undefined`, and `getPublicUrl('INPUT')` points at `INPUT.json`. If both files are present, opening the store fails instead of guessing which one is the input. Plain Crawlee claims nothing, so there a bare `INPUT.json` is just a file named `INPUT.json`.
- Every other sidecar-less file becomes a record **keyed by its filename**, in every store: a hand-placed `some-key.json` is the key `some-key.json`, and so is an `INPUT.json` in a store other than the default one. Dotfiles are skipped.

A `.json` file is adopted as `application/json; charset=utf-8` and anything else as `application/octet-stream`; there is no content sniffing. Adopted records are subject to the purge of the default store on start like any other record, unless a subclass spares them through `purgeKeyValueStore` — the Apify SDK keeps its run input this way.

Beyond the literal keys, three v3 behaviors are gone:

- **`INPUT.txt` and `INPUT.bin` are no longer the input.** v3 probed those extensions too. In v4 they are adopted under their own names, so `getValue('INPUT')` returns `undefined` and the purge on start deletes them. Rename such an input to `INPUT.json` (or drop the extension) before upgrading.
- **Extensionless input files report `application/octet-stream`.** In v3 a bare value file with no extension was read as `text/plain`. Give the file a `.json` extension if you need a more specific type.
- **Malformed input files are no longer silently swallowed.** In v3 an `INPUT.json` containing invalid JSON was treated as a missing record (`getValue` returned `undefined`). In v4 the raw bytes are returned verbatim and parsing happens in the `KeyValueStore` frontend, so a malformed value surfaces a parse error at read time instead of looking absent.

### `globs`, `regexps`, and `pseudoUrls` replaced by `include`

The separate `globs`, `regexps`, and `pseudoUrls` URL-filtering options of `enqueueLinks()`, the click-elements enqueue helpers, and `SitemapRequestLoader` have been collapsed into a single `include` option (mirroring the already-unified `exclude` option).

The `PseudoUrl` class is no longer exported and the `@apify/pseudo_url` dependency has been dropped. Rewrite any pseudo-URL patterns as globs or regular expressions.

Per-pattern request options (`label`, `userData`, `method`, `payload`, `headers` set directly on a pattern object) are no longer supported. Use the top-level `label` / `userData` options, or `transformRequestFunction`, to set request options for the enqueued requests.

**Before:**
```typescript
await enqueueLinks({
    globs: ['https://crawlee.dev/docs/**'],
    regexps: [/\/blog\//],
});
```

**After:**
```typescript
await enqueueLinks({
    include: ['https://crawlee.dev/docs/**', /\/blog\//],
});
```

#### Migrating `pseudoUrls`

A `PseudoUrl` is equivalent to an anchored regular expression: the text inside `[ ]` is the pattern (a wildcard), everything outside it is matched literally, and the whole URL is anchored. Translate each pseudo-URL to a `RegExp` (or a glob, if the pattern is simple enough):

**Before:**
```typescript
await enqueueLinks({
    pseudoUrls: ['https://crawlee.dev/[.*]'],
});
```

**After:**
```typescript
await enqueueLinks({
    // faithful translation — [.*] becomes .*, literal text is escaped and anchored
    include: [/^https:\/\/crawlee\.dev\/.*$/],
    // or, when the pattern is simple, an equivalent glob:
    // include: ['https://crawlee.dev/**'],
});
```

#### `include` patterns no longer replace the enqueue strategy

In v3, providing any URL patterns (`globs`, `regexps`, `pseudoUrls`) disabled the default enqueue strategy - the patterns were the only filter. In v4, the `strategy` **always applies** and is combined with `include` using AND logic: a URL must match an `include` pattern *and* satisfy the strategy (default `same-hostname`) to be enqueued. This mirrors the behavior of Crawlee for Python.

The practical consequence: patterns that used to match URLs on other hostnames (e.g. subdomains) now silently enqueue nothing unless you relax the strategy explicitly:

```ts
// v3 - the glob alone allowed subdomains
await enqueueLinks({
    globs: ['https://*.example.com/'],
});

// v4 - the default same-hostname strategy would filter the subdomains out again,
// so relax it explicitly
await enqueueLinks({
    include: ['https://*.example.com/'],
    strategy: 'same-domain',
});
```

### `transformRequestFunction` precedence in `enqueueLinks`

The `transformRequestFunction` callback in `enqueueLinks` now runs **after** URL pattern filtering (`include`, `exclude`) instead of before. This means it has the highest priority and can overwrite any request options set by the global `label` / `userData` options.

The priority order is now (lowest to highest):
1. Global `label` / `userData` options
2. `transformRequestFunction`

The `transformRequestFunction` callback receives a `RequestOptions` object and can return either:
- The modified `RequestOptions` object
- A new `RequestOptions` plain object
- `'unchanged'` to keep the original options as-is
- A falsy value or `'skip'` to exclude the request from the queue

### `enqueueLinks()` return value reshaped: `AddRequestsBatchedResult` instead of `BatchAddRequestsResult`

`enqueueLinks()` (and `context.addRequests()`) now return the same `AddRequestsBatchedResult` object that `crawler.addRequests()` / `queue.addRequestsBatched()` already returned in v3, instead of repackaging it into the legacy `BatchAddRequestsResult` shape:

| Before (`BatchAddRequestsResult`) | After (`AddRequestsBatchedResult`) |
| --- | --- |
| `processedRequests` | `addedRequests` |
| `unprocessedRequests` (always `[]` — `enqueueLinks()` never actually populated it) | *(removed — retries are handled internally, see "`RequestQueue.addRequestsBatched` no longer retries rejected requests" below)* |
| *(not exposed)* | `waitForAllRequestsToBeAdded` — a promise resolving with the requests added in batches after the first (new) |
| *(not exposed)* | `requestsOverLimit` — requests dropped because of the `limit` / `maxRequestsPerCrawl` budget (new) |

**Before:**
```typescript
const { processedRequests } = await enqueueLinks();
```

**After:**
```typescript
const { addedRequests } = await enqueueLinks();
```

### `extractLinks()`: extracting URLs without enqueueing them

Crawling contexts that support `enqueueLinks()` (Cheerio, JSDOM, LinkeDOM, and browser-based crawlers) now also expose an `extractLinks()` helper that returns the matching URLs as strings, without adding them to the request queue:

```typescript
const urls = await extractLinks({ selector: '.product-link' });
```

`enqueueLinks()` itself is unchanged in behavior — it now calls `extractLinks()` internally and forwards the URLs to `context.addRequests()`.

### `context.addRequests()` now applies `enqueueLinks`-style filtering, and `BasicCrawler` no longer has `enqueueLinks`

`context.addRequests()` (and `crawler.addRequests()`) accept the same `include` / `exclude` / `strategy` / `transformRequestFunction` / `onSkippedRequest` options as `enqueueLinks()`, and resolve `baseUrl`-relative URLs the same way. Unlike `enqueueLinks()`, there is no implicit "current page" to anchor the strategy to, so `strategy` defaults to `EnqueueStrategy.All` here instead of `EnqueueStrategy.SameHostname`.

`context.addRequests()` also now returns an `AddRequestsBatchedResult` (previously it resolved to `void`).

`BasicCrawler` (and its `BasicCrawlingContext`) no longer has an `enqueueLinks()` method — `BasicCrawler` has no concept of a page to extract links from. `enqueueLinks()` remains available on crawlers with web content (`CheerioCrawler`, `HttpCrawler`-derived crawlers, `PlaywrightCrawler`, `PuppeteerCrawler`, etc.), now implemented in terms of `extractLinks()` + `addRequests()`.

The `robotsTxtFile` / `respectRobotsTxtFile` per-call options are removed from `enqueueLinks()` — robots.txt filtering is applied by the crawler consistently via `BasicCrawlerOptions.respectRobotsTxtFile`.

### `onSkippedRequest` receives a `Request` instead of a URL string

The callback now gets `{ request, reason }` instead of `{ url, reason }` — use `request.url` for the URL.

### Skipping a request with `context.skipRequest()`

In v3, skipping a request without it counting as a failure took a hack: set `request.noRetry`, throw, then decrement `requestsFailed` and silence the error log. Call `skipRequest(message?)` from the crawling context instead — in `extendContext`, a navigation hook, the request handler or the `errorHandler`. The request is marked as handled with `state` set to `RequestState.SKIPPED`, is neither retried nor passed to `failedRequestHandler`, and `onSkippedRequest` fires with the new `'manual'` reason. Storage writes made for the request before the skip are rolled back.

See the [Skipping requests](../examples/skip-request) example.

### robots.txt error responses follow RFC 9309

v3 parsed the body of a robots.txt response regardless of its status code. v4 follows [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309#section-2.3.1.3) instead: a `4xx` response allows everything and a `5xx` response disallows everything, whatever the body says.

With `respectRobotsTxtFile` enabled, a site that answers `/robots.txt` with a `5xx` is therefore skipped entirely. The crawler caches robots.txt per origin for the whole run, so every request to that origin is skipped with the `robotsTxt` reason.

### `sameDomainDelaySecs` is now backed by `ThrottlingRequestManager`

`sameDomainDelaySecs` still works and still means what it did in v3 — subdomains included, it paces a whole registrable domain rather than a single host. Underneath, it is now a floor reported to the crawler's request manager as a [pacing signal](./request-loaders.md#irequestmanager-gained-recordpacingsignal); only when nothing there paces does the crawler wrap its manager in a `ThrottlingRequestManager`, which gives each domain a queue of its own so a delayed request waits in storage rather than in an in-memory map. Consequences worth knowing about:

- A crawl that discovers more than `maxThrottledDomains` domains (100 by default) throws instead of quietly running out of steam. Pass your own `ThrottlingRequestManager` as `requestManager` to raise the ceiling — or crawl fewer sites.
- Combined with a manager that paces on its own, a `ThrottlingRequestManager` with `domains: 'all'` and `throttleBy: 'registrableDomain'` takes the delay as its `minCrawlDelaySecs` floor, wherever it sits in a composition. One that paces only *some* domains throws instead — set `domains: 'all'`, or configure the delay there yourself and drop the option.
- Requests that never pass through the request manager — those from a `requestsFromUrl` list — are not paced, and the crawler warns when it hands one out.

### Internal KVS keys renamed

Several internal Crawlee keys were prefixed with the `SDK_` prefix for legacy reasons — these keys now start with `CRAWLEE_` instead. These are, e.g., `CRAWLEE_SESSION_POOL_STATE` or `CRAWLEE_CRAWLER_STATISTICS_{n}`.

## Only if you subclassed crawlers or touched internals

Skip this section unless you subclass Crawlee classes, override `protected` members, or read fields that were never documented. Many protected methods lost their underscore prefix, private members became native `#` fields, and a long list of accidentally exposed members is now `private` or `@internal`. Crawler generics, handler types and navigation hook types were reshaped, `Request` was split into `Request` and `CrawlingRequest`, and `RecoverableState` changed its serialization contract.

See [Upgrading to v4: subclassing and internals](./internals.md) for the details.

## Only if you manage sessions or proxies yourself

Applies when you construct `SessionPool` or `Session` instances directly, implement your own pool, or configure proxies beyond a static URL list. Crawlers accept any `ISessionPool` implementation, `createSessionFunction` no longer receives the pool, and `Session` no longer references its pool or emits `sessionRetired`. `tieredProxyUrls` is gone in favor of named sessions, and `ProxyConfiguration.newUrl()` / `newProxyInfo()` dropped their `sessionId` argument.

See [Upgrading to v4: sessions and proxies](./sessions-and-proxies.md) for the details.

## Only if you customize browser management

Applies when you construct a `BrowserPool` yourself, reach for `browserController`, or tune `AdaptivePlaywrightCrawler` internals. Crawlers accept any `IBrowserPool`, `@crawlee/browser-pool` is no longer re-exported from `crawlee`, and `browserController` is gone from the crawling context. Puppeteer cookies are synced at the browser-context level, a rendering type predictor you pass in is yours to initialize, and several unused options, types and `BrowserPool` internals were removed.

See [Upgrading to v4: browser management](./browser-management.md) for the details.

## Only if you customize crawler statistics

Applies when you passed `statisticsOptions` to a crawler, subclassed `Statistics`, or passed type arguments to `BrowserCrawler`/`BrowserCrawlerOptions`. `statisticsOptions` is replaced by passing a `Statistics` (or any `IStatistics`) instance, the `*Job()` recording methods are renamed, persistence is stricter, and extra persisted fields are declared with the `stateExtension` option instead of subclassing.

See [Upgrading to v4: crawler statistics](./statistics.md) for the details.

## Only if you wrote a custom HTTP client or used `got-scraping` directly

Applies when you implemented `BaseHttpClient` yourself, or imported `gotScraping` from `@crawlee/utils`. `BaseHttpClient` moved to `@crawlee/http-client` and is built around a single `fetch()` method returning a native `Response`. The `got-scraping` client lives in the opt-in `@crawlee/got-scraping-client` package, and `gotScraping` is no longer exported from `@crawlee/utils`.

See [Upgrading to v4: HTTP clients](./http-clients.md) for the details.

## Only if you use `FileDownload`

Applies when you use the `FileDownload` crawler from `@crawlee/http`.

### `FileDownload` now extends `BasicCrawler` and no longer takes `FileDownloadOptions`

`FileDownload` was re-based from `HttpCrawler` onto `BasicCrawler`. Its constructor now accepts `BasicCrawlerOptions<FileDownloadCrawlingContext>` instead of the dedicated `FileDownloadOptions` type, which — together with `StreamHandlerContext` — has been **removed** from `@crawlee/http`. In practice this means the HTTP-crawler-specific options (`navigationTimeoutSecs`, `additionalMimeTypes`, `suggestResponseEncoding`, `forceResponseEncoding`, the `gotOptions`-style `preNavigationHooks`, etc.) are no longer accepted by `FileDownload`; downloading is a thin layer over `BasicCrawler` and the request is performed via `sendRequest` / the configured `httpClient`. If you passed any of those HTTP-only options to `FileDownload`, drop them and configure the `httpClient` (or the request itself) directly. This includes TLS verification: v3 `FileDownload` inherited `ignoreSslErrors: true`, while v4 has no `ignoreTlsErrors` option and verifies certificates. To keep the v3 behavior, pass `httpClient: new ImpitHttpClient({ ignoreTlsErrors: true })`. The `FileDownloadCrawlingContext` type also lost its extra type parameter and no longer extends the internal HTTP crawling context — it now extends the common `CrawlingContext` with `contentType`, `request`, and `response`.

### Crawling context in the `FileDownload` crawler no longer includes `body` and `stream` properties

The crawling context in the `FileDownload` crawler no longer includes the `body` and `stream` properties. These can be accessed directly via the `response` property instead, e.g. `context.response.bytes()` or `context.response.body`.

## Only if you use request lists and loaders

Applies when you use `RequestList` or `SitemapRequestList`, pass `requestList` / `requestQueue` to a crawler, or implement the request loader and manager interfaces yourself. `IRequestList` is now `IRequestLoader` with async counters, `isEmpty()` / `isFinished()` collapsed into `checkReadiness()`, and `SitemapRequestList` is `SitemapRequestLoader`. Crawlers read from a single `requestManager` (the `requestList` / `requestQueue` options still work, but are deprecated), and the new opt-in `ThrottlingRequestManager` can back off per domain on HTTP 429.

See [Upgrading to v4: request loaders and managers](./request-loaders.md) for the details.

## Only if you implement a storage backend

Applies when you implement your own storage backend, or reach below the `Dataset`, `KeyValueStore` and `RequestQueue` frontends. The `StorageBackend` interface (formerly `StorageClient`) needs four classes instead of seven, with async factory methods and slimmer sub-backends. `RequestQueueV1` / `RequestQueueV2` are merged into `RequestQueue`, the `requestLocking` experiment and `requestLockSecs` are gone, and `Dataset.listItems()` is replaced by `getData()` / `values()`.

See [Upgrading to v4: storage backends](./storage-backends.md) for the details.

## Only if you tuned autoscaling

The `minConcurrency` / `maxConcurrency` / `maxRequestsPerMinute` crawler options work as before. This section matters when you used `autoscaledPoolOptions`, drove an `AutoscaledPool` directly, or configured snapshotting and system status. Snapshotting, system status and the scaling logic moved out of `AutoscaledPool`, which is now internal, into a `ConcurrencySystem` that several crawlers can share. `autoscaledPoolOptions` became `taskLoopOptions` and no longer carries concurrency config, and the load-signal options were consolidated into a single `loadSignals` bag.

See [Upgrading to v4: autoscaling](./autoscaling.md) for the details.

## Only if you import helpers from `@crawlee/utils` or `@crawlee/types`

Applies when you import utility functions, enums or types directly from `@crawlee/utils` or `@crawlee/types`, rather than only using the crawlers. The low-level resource-detection helpers are removed, `@crawlee/types` utility types are no longer re-exported from other packages, and several `@crawlee/utils` exports moved to the `@crawlee/utils/internal` entry point or were dropped. `RobotsTxtFile.find()` takes `proxyUrl` in its options, and the HTML-parsing helpers are now asynchronous.

See [Upgrading to v4: `@crawlee/utils` and `@crawlee/types`](./utils-and-types.md) for the details.

## Only if you use `JSDOMCrawler` or `LinkeDOMCrawler`

They moved out of this repository into their own packages, so install them explicitly:

```bash
npm install @crawlee/jsdom @crawlee/linkedom
```

The `crawlee` meta-package no longer re-exports them.

## Only if you import from `@crawlee/core` directly

The crawler-only parts of `@crawlee/core` moved to `@crawlee/basic`, so that `@crawlee/core` carries just the storage, request and configuration layer. The moved exports are:

- autoscaling: `AutoscaledPool`, `Snapshotter`, `SystemStatus`, the `LoadSignal` implementations and their option/snapshot types
- crawler internals: `Statistics`, `ErrorTracker`, `ErrorSnapshotter`, and the crawling-context types (`CrawlingContext`, `RestrictedCrawlingContext`, `LoadedRequest`, …)
- `SessionPool`, `Session` and the session-pool constants
- `Router` (with `RouterHandler`, `RouterRoutes` and `defaultRoute`)
- the cookie helpers (`mergeCookies`, `getCookiesFromResponse`, …)
- `SitemapRequestLoader` (with `SitemapRequestLoaderOptions`)
- the `enqueueLinks()` option types (`EnqueueLinksOptions`, `RequestTransform`, `SkippedRequestCallback`) and the URL pattern types (`GlobInput`, `RegExpInput`, …)
- the crawler-only error classes `RetryRequestError` and `MissingRouteError`

`@crawlee/basic` re-exports everything from `@crawlee/core`, so `import { SessionPool } from '@crawlee/basic'` (or from `crawlee`, `@crawlee/http`, `@crawlee/playwright`, …) keeps working unchanged. Only imports written against `@crawlee/core` itself need to be pointed at `@crawlee/basic`.

## Only if you use `StagehandCrawler`

### Stagehand type narrowings

A few Stagehand-specific option types were tightened:

- `StagehandGotoOptions` dropped its `Dictionary &` intersection — it is now exactly `NonNullable<Parameters<Page['goto']>[1]>`, so arbitrary extra keys are no longer accepted.
- The explicit `failedRequestHandler` field was removed from `StagehandCrawlerOptions` (it is inherited from the base crawler options generically, so passing `failedRequestHandler` still works).
- The `ignoreShadowRoots` and `ignoreIframes` options were removed from `StagehandCrawler`.

### Removed Stagehand exports and options

- The `StagehandRequestHandler` type was removed. It was never referenced by `StagehandCrawlerOptions.requestHandler`, which uses `RequestHandler<StagehandCrawlingContext>` — use that instead.
- The `stagehandUtils` namespace was removed. Its only member was internal glue that was never part of the documented surface.
- The `AgentResult` re-export was removed. Import it from `@browserbasehq/stagehand` directly — it is a non-optional peer dependency, so it is already installed.
- `StagehandLaunchContext.stagehandOptions` was removed. It never had any effect: the value was always overwritten by the `stagehandOptions` option on the crawler and on `stagehandBrowserPool()`. Pass `stagehandOptions` at the top level of the crawler instead, or of `stagehandBrowserPool()` when you supply a `browserPool`.
- `StagehandPlugin.stagehandOptions` is now private and `StagehandPlugin.getStagehandForBrowser()` is gone. Reach the `Stagehand` instance through the crawling context's `stagehand` property.

## Appendix: removed symbols

The full list of removed exports and members, for ctrl-F purposes, is on the [removed symbols](./removed-symbols.md) page.
