# Configuration and context

## Configuration and services

Replace `Configuration.get()` with property reads and `set()` with constructor options. Instances are immutable. Precedence is constructor options, environment variables, `crawlee.json`, then defaults.

Pass `configuration` in crawler options instead of a second constructor argument. `PuppeteerLauncher` retains that argument; replace the removed `PlaywrightLauncher` export with `launchPlaywright(launchContext, configuration)` or a pool factory.

| v3 | v4 |
| --- | --- |
| `Configuration.getGlobalConfig()` | `Configuration.getGlobalConfiguration()` |
| `LocalEventManager.fromConfig()` | `LocalEventManager.fromConfiguration()` |
| `Configuration.getStorageClient()` | `serviceLocator.getStorageBackend()` |
| `Configuration.getEventManager()` | `serviceLocator.getEventManager()` |
| `config.useStorageClient(backend)` | `serviceLocator.setStorageBackend(backend)` |
| `config.useEventManager(manager)` | `serviceLocator.setEventManager(manager)` |
| `Configuration.resetGlobalState()` | `serviceLocator.reset()` |
| `config.storageManagers` | `serviceLocator.getStorageInstanceManager()` |

Use `serviceLocator.getConfiguration()` for the active configuration. Pass `configuration`, `storageBackend` and `eventManager` as crawler options for isolation. Event-manager constructors now take options; `LocalEventManager.fromConfiguration()` derives intervals from configuration. The locator's `reset()` and `getStorageInstanceManager()` are internal; use public storage `.open()` methods in application code.

Remove `defaultDatasetId`, `defaultKeyValueStoreId`, `defaultRequestQueueId` and `CRAWLEE_DEFAULT_*_ID`; open and pass specific storages explicitly. For removed `inputKey` / `CRAWLEE_INPUT_KEY`, follow the storage reference.

Rename Crawlee `config` options/properties to `configuration`: storage opening, `useState`, `purgeDefaultStorages`, snapshots, `RecoverableState`, request lists and load signals.

## Hooks and context

`requestHandlerTimeoutSecs` covers only the handler, default 60 seconds. `navigationTimeoutSecs` covers pre-hooks, navigation and post-hooks together, default 30 seconds for HTTP and 60 for browsers. Slow hooks may need a larger navigation budget or `context.extendTimeout(seconds)`.

`CRAWLEE_INTERNAL_TIMEOUT` overrides the whole-request timeout in milliseconds; values below phase timeouts are ignored. Per-route limits use the third `router.addHandler()` argument: `{ requestHandlerTimeoutSecs }`.

HTTP hooks mutate context/request fields instead of receiving `gotOptions`. Browser hooks mutate `context.gotoOptions`. Read errors from the second `errorHandler` / `failedRequestHandler` argument. Replace `context.crawler` with a closure or `extendContext: () => ({ crawler })`. Extensions run before navigation; page/response-dependent logic belongs in post-hooks or handlers. The context type is strict: reads of undeclared properties such as `context.foo` fail to compile. Declare them through `extendContext` or typed `userData` instead of casting.

`closeCookieModals` and `idcac-playwright` are removed. Preserve consent handling through an explicit integration, such as `@duckduckgo/autoconsent` in a pre-hook.

## Validation and logging

`ArgumentValidationError` replaces ow's `ArgumentError`; structured details are in `error.issues` and `error.cause`. Update error-message assertions. Class-valued options such as `httpClient`, `configuration` and `eventManager` require instances, including in mocks. Crawlee's zod 4 dependency can coexist with application zod 3.

Rename crawler `log` to `logger`. Wrap custom `@apify/log` instances with `new ApifyLogAdapter(log)`. Exposed loggers use `CrawleeLogger`; replace explicit `Log` annotations and call `setLevel()` on the underlying logger, not `crawler.log` or `context.log`.
