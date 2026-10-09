# Configuration and context

## Configuration and services

`Configuration.get()` and `set()` are removed. Read properties directly and create a new immutable configuration for changes. Assigning a property throws. Precedence is constructor options, environment variables, `crawlee.json`, then defaults.

```ts
const configuration = new Configuration({ headless: false, persistStateIntervalMillis: 10_000 });
const crawler = new PlaywrightCrawler({ configuration, requestHandler });
```

The second configuration argument is removed from crawler constructors, but stays on `PlaywrightLauncher` and `PuppeteerLauncher`.

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

Prefer `serviceLocator.getConfiguration()` for the active configuration. `getGlobalConfiguration()` also follows the active service locator, despite its name. Pass `configuration`, `storageBackend` and `eventManager` in crawler options for per-crawler isolation. Event-manager constructors take an options object; `LocalEventManager.fromConfiguration()` derives intervals from a configuration.

`serviceLocator.reset()` and `getStorageInstanceManager()` are internal and have no semver guarantees. Use `reset()` for test cleanup when needed; application code should open storages through their public `.open()` methods.

`Configuration.defaultDatasetId`, `defaultKeyValueStoreId`, `defaultRequestQueueId` and their `CRAWLEE_DEFAULT_*_ID` environment variables are removed. Default storages use a reserved alias. Open and pass a specific storage explicitly when the project requires one. `Configuration.inputKey` and `CRAWLEE_INPUT_KEY` also disappear; read the storage reference before replacing input access or handling default-store purge.

Rename Crawlee's `config` options and properties to `configuration`, including storage opening, `useState`, `purgeDefaultStorages`, snapshot helpers, `RecoverableState`, request-list and load-signal options. Do not rename unrelated application variables merely because they are called `config`.

## Hooks and context

`requestHandlerTimeoutSecs` covers the handler only. `navigationTimeoutSecs` covers pre-hooks, navigation and post-hooks together, with defaults of 30 seconds for HTTP and 60 for browser crawlers. `navigationHooksTimeoutSecs` is removed. The default handler timeout is 60 seconds. Slow hooks may need a larger navigation budget or `context.extendTimeout(seconds)`.

An internal whole-request timeout also covers other phases. `CRAWLEE_INTERNAL_TIMEOUT` overrides it in milliseconds, but values below phase timeouts are ignored with a warning. Router handlers may receive a third options argument with `requestHandlerTimeoutSecs` for per-route limits.

HTTP pre-hooks mutate the crawling context, such as `request.headers`, instead of a second `gotOptions` argument. Browser hooks mutate `context.gotoOptions` instead of receiving it separately.

Use the second callback argument of `errorHandler` and `failedRequestHandler` for the error. For removed `context.crawler`, use a closure or add it through `extendContext: () => ({ crawler })`. Context additions should have inferred or declared types. `extendContext` runs before navigation; logic requiring a page or parsed response belongs in a post-hook or handler.

`closeCookieModals` is removed from contexts and both utility namespaces, along with the `idcac-playwright` peer dependency. Migrate any required consent handling explicitly, for example using `@duckduckgo/autoconsent` in a pre-hook. Do not silently drop consent behavior.

## Validation and logging

Argument validation uses zod. `ArgumentValidationError` replaces ow's `ArgumentError`; inspect `error.issues` for structured issues and `error.cause` for the `ZodError`. Update tests expecting old error text. Class-valued options such as `httpClient`, `configuration` and `eventManager` require actual instances rather than object-literal mocks. Crawlee depends on zod 4.1+ itself; an application's own zod 3 dependency can coexist.

The crawler `log` option becomes `logger`. Wrap an `@apify/log` instance with `new ApifyLogAdapter(log.child({ prefix: 'MyCrawler' }))`. `crawler.log`, `context.log` and other exposed loggers use `CrawleeLogger`; keep ordinary `info`, `debug` and `child` calls. Set log levels on the underlying logging library, since `CrawleeLogger` has no `setLevel()`.
