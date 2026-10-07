# Crawlee and Apify packages

Use this map when inspecting dependencies and deciding which imports or packages the migration affects. Include all workspace manifests and their dependency sections. Use the lockfile to identify transitive versions and duplicate Crawlee installations. For a package not listed here, inspect its metadata and exports before changing it.

## Crawlee packages

| Package | Purpose |
| --- | --- |
| `crawlee` | Convenience package re-exporting the main crawling, storage and utility APIs, with the `crawlee` CLI. |
| `@crawlee/core` | Requests, queues, datasets, key-value stores, configuration and service management. Crawler-specific APIs move to basic in v4. |
| `@crawlee/basic` | BasicCrawler, sessions, routing, statistics, context composition, request scheduling and concurrency. |
| `@crawlee/http` | HttpCrawler, the DOM-crawler base and FileDownload. |
| `@crawlee/cheerio` | CheerioCrawler for parsing and scraping HTML through HTTP requests. |
| `@crawlee/browser` | BrowserCrawler, the shared base for browser-based crawlers. |
| `@crawlee/playwright` | PlaywrightCrawler, AdaptivePlaywrightCrawler and Playwright helpers. |
| `@crawlee/puppeteer` | PuppeteerCrawler and Puppeteer helpers. |
| `@crawlee/stagehand` | StagehandCrawler for AI-assisted browser automation. Install and import it separately. |
| `@crawlee/browser-pool` | Browser lifecycle, plugins, controllers and shared or remote browser pools. |
| `@crawlee/jsdom` | JSDOMCrawler. In v4 it lives in a separate package and is no longer re-exported by `crawlee`. |
| `@crawlee/linkedom` | LinkeDOMCrawler. In v4 it lives in a separate package and is no longer re-exported by `crawlee`. |
| `@crawlee/http-client` | BaseHttpClient and the fetch-based HTTP client, using native Request and Response. |
| `@crawlee/impit-client` | ImpitHttpClient with browser TLS impersonation and proxy support. The default HTTP client when installed. |
| `@crawlee/got-scraping-client` | Opt-in GotScrapingHttpClient for projects retaining got-scraping behavior. |
| `@crawlee/fs-storage` | FileSystemStorageBackend for persistent local storage. |
| `@crawlee/fs-storage-native` | Native filesystem implementation used by fs-storage. Its platform binaries require optional dependencies. |
| `@crawlee/memory-storage` | Removed v3 package. Choose v4 FileSystemStorageBackend for disk persistence or MemoryStorageBackend from core for memory only. |
| `@crawlee/types` | Shared TypeScript contracts and utility types, including collaborator and storage-backend interfaces. |
| `@crawlee/utils` | Public HTML, URL, robots, sitemap and other crawling helpers. Its `/internal` entry has no semver guarantees. |
| `@crawlee/otel` | OpenTelemetry instrumentation for Crawlee. |
| `@crawlee/cli` | Command implementation for creating and running projects, browser installation and this upgrade prompt. |
| `@crawlee/templates` | Project-template metadata used by the CLI. |

The main `crawlee` package re-exports many APIs, but not every package or type. Preserve supported imports rather than replacing all of them with the convenience package. Keep related Crawlee packages on compatible v4 releases and declare packages imported directly by application code. Browser automation libraries such as `playwright` and `puppeteer` remain separate dependencies.

## Apify packages

| Package | Purpose |
| --- | --- |
| [`apify`](https://docs.apify.com/sdk/js/reference) | Apify SDK for Actor initialization and shutdown, input/output, storage access, platform events and proxy integration. Crawlers come from Crawlee. |
| [`apify-client`](https://docs.apify.com/api/client/js/docs) | JavaScript client for the Apify REST API, including Actor runs and cloud storage. |
| [`apify-cli`](https://docs.apify.com/cli/docs) | The `apify` command for local Actor development and managing the Apify platform. Separate from the Crawlee CLI. |
| `@apify/log` | Logging library used by Crawlee's default logger. Use ApifyLogAdapter when passing a custom instance to a v4 crawler. |
| `@apify/consts` | Constants shared across Apify projects. |
| `@apify/datastructures` | Shared data structures used by Crawlee and other Apify libraries. |
| `@apify/timeout` | Promise timeout and cancellation helpers. |
| `@apify/utilities` | Shared utilities used by Apify libraries and Crawlee. |
| `@apify/validations` | Shared zod-based argument validation and readable validation errors. |
| `@apify/ps-tree` | Process-tree inspection for finding child processes. |
| `@apify/tsconfig` | Shared TypeScript compiler configuration for development. |
| `@apify/oxlint-config` | Shared lint configuration for development. |
| `@apify/pseudo_url` | Legacy pseudo-URL pattern support removed from Crawlee v4. Translate affected Crawlee patterns to globs or regular expressions. |
| `apify-node-curl-impersonate` | Wrapper around curl-impersonate for HTTP requests with browser-like TLS fingerprints. It is separate from Crawlee's impit client. |

These Apify packages have their own release versions. A Crawlee v4 migration does not mean installing `apify@4`, `apify-client@4` or v4 of every helper. Inspect the selected SDK's Crawlee dependencies or peer requirements, particularly for Actor projects using cloud storage. Update an Apify dependency when compatibility or an affected direct API requires it. Preserve Actor initialization, shutdown and platform integration, and do not automatically replace Actor storage methods with local Crawlee storage methods.

Most shared helpers are transitive dependencies. Do not promote them to direct dependencies merely because they appear in the lockfile. Development configuration packages do not provide crawler or Actor runtime APIs.
