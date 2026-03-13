# Plan: Lightpanda Support via PlaywrightCrawler

## Problem

Crawlee users who need fast, low-memory headless crawling cannot use [Lightpanda](https://lightpanda.io) today. Lightpanda starts instantly, uses 10x less memory than Chrome, and runs pages 10x faster — but Crawlee has no first-class way to connect to it.

Lightpanda exposes a CDP (Chrome DevTools Protocol) server at a WebSocket endpoint. Playwright can connect to it via `chromium.connectOverCDP('ws://host:port')` instead of launching a binary. Crawlee's current `PlaywrightCrawler` always launches a binary — it has no path to use `connectOverCDP`.

## Goal

Add a `LightpandaCrawler` to Crawlee that:
- Connects to Lightpanda over CDP using Playwright
- Optionally manages the Lightpanda process lifecycle automatically
- Exposes the same request handler API as `PlaywrightCrawler`
- Ships as its own package (`@crawlee/lightpanda`) following the `@crawlee/stagehand` precedent

## Background: How Lightpanda Works

Lightpanda is started as a local CDP server:

```sh
./lightpanda serve --host 127.0.0.1 --port 9222
```

Or programmatically via the `@lightpanda/browser` npm package:

```js
import { lightpanda } from '@lightpanda/browser';
const proc = await lightpanda.serve({ host: '127.0.0.1', port: 9222 });
```

Playwright then connects using:

```js
import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('ws://127.0.0.1:9222');
```

The rest of the Playwright API — `page.goto()`, `page.evaluate()`, `page.locator()`, etc. — works as normal.

## Existing Precedents

Two packages in the repo establish the patterns this plan follows:

**`@crawlee/playwright`** — The direct equivalent for a real browser. Every structural decision (crawler class, launcher, plugin, `ow` validation, `optionsShape`, guards, exported helpers) is taken from here.

**`@crawlee/stagehand`** — Uses the same `connectOverCDP` approach: Stagehand launches a browser and exposes a CDP URL; the plugin connects via `chromium.connectOverCDP(cdpUrl)`.

Key files:
- [playwright-crawler.ts](../../packages/playwright-crawler/src/internals/playwright-crawler.ts)
- [playwright-launcher.ts](../../packages/playwright-crawler/src/internals/playwright-launcher.ts)
- [playwright-plugin.ts](../../packages/browser-pool/src/playwright/playwright-plugin.ts)
- [stagehand-plugin.ts](../../packages/stagehand-crawler/src/internals/stagehand-plugin.ts)

## Architecture

Crawlee uses a layered system: `Crawler → Launcher → Plugin → BrowserPool`. Each layer is overridable by extending base classes.

| Layer | Playwright equivalent | Lightpanda equivalent |
|---|---|---|
| Crawler | `PlaywrightCrawler` | `LightpandaCrawler` |
| Launcher | `PlaywrightLauncher` / `PlaywrightLaunchContext` | `LightpandaLauncher` / `LightpandaLaunchContext` |
| Plugin | `PlaywrightPlugin` (overrides `_launch()`) | `LightpandaPlugin` (overrides `_launch()`) |

No changes are needed to `browser-pool`, `playwright-crawler`, `@crawlee/browser`, or `@crawlee/core`.

## Implementation Plan

### 1. New package: `packages/lightpanda-crawler/`

```
packages/lightpanda-crawler/
  src/
    index.ts
    internals/
      lightpanda-crawler.ts
      lightpanda-launcher.ts
      lightpanda-plugin.ts
  package.json
  tsconfig.json
  tsconfig.build.json
  CHANGELOG.md
  README.md
```

---

#### `lightpanda-plugin.ts`

Extends `BrowserPlugin<BrowserType, LaunchOptions, PlaywrightBrowser>`. Must implement all four abstract methods from `BrowserPlugin`:

**`_launch(launchContext)`** — Core logic:

1. If `autoStart: true`:
   - Try `@lightpanda/browser` via dynamic import (`await import('@lightpanda/browser')`) to avoid peer dep issues at require-time
   - If not available, fall back to `child_process.spawn` at `lightpandaPath`
   - Throw via `_throwAugmentedLaunchError()` if neither is available (includes Docker image hint and install instructions)
2. **Startup readiness**: poll the TCP port (via `net.createConnection`) until the Lightpanda server accepts connections before calling `connectOverCDP`. Timeout after `operationTimeoutSecs`. This prevents a race condition where `connectOverCDP` is called before the process is listening.
3. Call `chromium.connectOverCDP('ws://host:port')`
4. On `browser.disconnected`: kill the managed process and clean up
5. On Lightpanda process `exit` with non-zero code mid-crawl: treat as fatal — emit error, do not retry silently

**`_isChromiumBasedBrowser()`** — **Must return `false`.**

This is critical: `BrowserPlugin.launch()` checks this method before calling `_launch()`. If it returns `true`, the base class injects `--disable-blink-features=AutomationControlled` and a custom `--user-agent` into `launchOptions.args`. These args are then passed to `connectOverCDP`, where they are invalid and will cause an error or silent failure. Lightpanda is not a real Chromium binary — it must return `false`.

**`_addProxyToLaunchOptions(launchContext)`** — For Lightpanda, proxy is not added to `launchOptions` (those are meaningless for a CDP connection). Instead, format the `proxyUrl` from `launchContext` into the `--http_proxy` CLI flag that is passed to the Lightpanda process at startup in `_launch()`. This method can be a no-op for the `launchOptions` object but stores the formatted proxy arg to be used during process spawn.

**`_createController()`** — Returns `new PlaywrightController(this)`. Lightpanda uses Playwright's existing controller since the browser handle is a standard Playwright `Browser` obtained via `connectOverCDP`.

**`_throwOnFailedLaunch(launchContext, cause)`** — Calls `_throwAugmentedLaunchError(cause, undefined, 'n/a', 'Install @lightpanda/browser or set lightpandaPath.')` for consistent error formatting.

---

#### `lightpanda-launcher.ts`

Extends `BrowserLauncher<LightpandaPlugin>`. Validates options with `ow` using `optionsShape`. Defines `LightpandaLaunchContext`:

```ts
export interface LightpandaLaunchContext extends BrowserLaunchContext<LaunchOptions, BrowserType> {
  /** Default: '127.0.0.1' */
  host?: string;
  /** Default: 9222 */
  port?: number;
  /**
   * When true, the crawler spawns the Lightpanda process automatically.
   * Requires @lightpanda/browser to be installed or lightpandaPath to be set.
   * @default true
   */
  autoStart?: boolean;
  /**
   * Explicit path to the Lightpanda binary.
   * Used when @lightpanda/browser is not installed.
   */
  lightpandaPath?: string;
  /** Proxy URL forwarded to Lightpanda via --http_proxy */
  proxyUrl?: string;
  /** Lightpanda server inactivity timeout in seconds */
  timeout?: number;
  /** If true, passes --obey_robots to Lightpanda */
  obeyRobots?: boolean;
}
```

Constructor hardcodes `launcher` to `chromium` via `BrowserLauncher.requireLauncherOrThrow<typeof import('playwright')>('playwright', 'apify/actor-node-playwright-*').chromium`.

Overrides `createBrowserPlugin()` to return `new LightpandaPlugin(this.launcher, { ...options, lightpandaOptions: this.lightpandaOptions })`.

Also exports a standalone `launchLightpanda(launchContext?, config?)` function mirroring `launchPlaywright()` in `@crawlee/playwright`.

---

#### `lightpanda-crawler.ts`

Extends `BrowserCrawler`. Validates options with `ow` using a static `optionsShape` extending `BrowserCrawler.optionsShape`.

Constructor guards (matching `PlaywrightCrawler`):
- Throws if `launchContext.proxyUrl` is set (users must use `proxyConfiguration`)
- Throws if `browserPoolOptions.browserPlugins` is set directly

Passes `useFingerprints: false` in `browserPoolOptions`. The `BrowserPool`'s fingerprint pre-launch hook mutates `launchOptions` with viewport and userAgent args, then `BrowserPlugin.launch()` further injects Chromium args. Both are irrelevant and potentially harmful for a CDP-connected non-browser. Fingerprinting must be disabled at the pool level.

Accepts `headless` as a top-level shortcut (same as `PlaywrightCrawler`), applying it to `launchContext.launchOptions.headless`.

Overrides:
- `_runRequestHandler(context)` — calls `registerUtilsToContext(context, this.options)` then `super._runRequestHandler(context)`, giving users access to `injectJQuery`, `blockRequests`, etc.
- `_navigationHandler(crawlingContext, gotoOptions)` — calls `gotoExtended(crawlingContext.page, crawlingContext.request, gotoOptions)` for POST, custom headers, and payload support

Also exports `createLightpandaRouter()` factory mirroring `createPlaywrightRouter()`.

---

#### `index.ts`

```ts
export * from '@crawlee/browser';           // re-export entire @crawlee/browser (matches @crawlee/playwright)
export * from './internals/lightpanda-crawler';
export * from './internals/lightpanda-launcher';
```

---

#### `package.json`

```json
{
  "name": "@crawlee/lightpanda",
  "version": "3.16.0",
  "dependencies": {
    "@apify/log": "^2.4.0",
    "@crawlee/browser": "3.16.0",
    "@crawlee/browser-pool": "3.16.0",
    "@crawlee/core": "3.16.0",
    "@crawlee/types": "3.16.0",
    "@crawlee/utils": "3.16.0",
    "ow": "^0.28.1",
    "tslib": "^2.4.0"
  },
  "peerDependencies": {
    "playwright": "*",
    "@lightpanda/browser": "*"
  },
  "peerDependenciesMeta": {
    "playwright": { "optional": false },
    "@lightpanda/browser": { "optional": true }
  }
}
```

`@lightpanda/browser` is optional because users may run Lightpanda as an external server (e.g. Docker) with `autoStart: false`. Version pinning for sibling `@crawlee/*` deps matches the monorepo's exact version (currently `3.16.0`), not `"*"`.

---

### 2. Wire into the monorepo

- Add `@crawlee/lightpanda` to `packages/crawlee/package.json` dependencies
- Re-export `LightpandaCrawler`, `LightpandaLaunchContext`, `launchLightpanda`, and `createLightpandaRouter` from `packages/crawlee/src/index.ts`
- Add to monorepo `turbo.json` task graph if needed (check existing packages for pattern)

### 3. Tests

Mirror `test/stagehand-crawler/`. Cover:
- `autoStart: true` (process managed by Crawlee) — happy path
- `autoStart: false` (external server, user manages process) — happy path
- `autoStart: true` with neither `@lightpanda/browser` nor `lightpandaPath` — expect descriptive error
- `connectOverCDP` race condition — process spawned but not yet listening → readiness poll succeeds
- `proxyUrl` forwarded as `--http_proxy` to the spawned process
- Process cleanup on crawler shutdown and on unexpected process exit
- Guards: `launchContext.proxyUrl` throws; `browserPoolOptions.browserPlugins` throws

### 4. Docs

Add a guide page at `docs/guides/lightpanda.mdx`:
- When to use Lightpanda vs Chromium (performance tradeoffs, API coverage gaps)
- Installation: `npm install @lightpanda/browser` vs pre-installed binary
- Basic usage example with `autoStart: true`
- `autoStart: false` example for Docker/Kubernetes deployments
- Proxy configuration

## Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| New package vs option in `PlaywrightCrawler` | New package | Keeps existing packages stable; consistent with `@crawlee/stagehand` pattern |
| `autoStart` default | `true` | Best DX — works out of the box when `@lightpanda/browser` is installed |
| Proxy support | Pass `--http_proxy` to Lightpanda process | Lightpanda handles proxy natively; `_addProxyToLaunchOptions` is a no-op for `launchOptions`, proxy arg stored separately for process spawn |
| `useIncognitoPages` | Supported | Lightpanda supports CDP browser contexts; `PlaywrightController._newPage()` handles context creation |
| Fingerprinting | **Disabled** (`useFingerprints: false`) | Fingerprint hooks mutate `launchOptions` args which are meaningless for `connectOverCDP`; passing them causes errors |
| `_isChromiumBasedBrowser()` | Returns `false` | Prevents `BrowserPlugin.launch()` from injecting `--disable-blink-features=AutomationControlled` and user-agent args into `launchOptions`, which would break `connectOverCDP` |
| `experimentalContainers` | Not supported | Requires browser extensions, incompatible with CDP-only browser |
| Browser type | Chromium only (hardcoded) | Lightpanda exposes only a Chromium-compatible CDP interface |
| `@lightpanda/browser` import | Dynamic (`await import(...)`) | Avoids peer dep errors at require-time when `autoStart: false`; matches Stagehand pattern |
| Controller | Reuse `PlaywrightController` | Browser handle from `connectOverCDP` is a standard Playwright `Browser`; no new controller needed |

## Constraints

- Lightpanda is **Linux-only** today (as of March 2026). The crawler constructor throws immediately on unsupported platforms with a clear message.
- Lightpanda's CDP support is incomplete compared to full Chromium. Pages relying on advanced browser APIs may fail; documented in the guide.
- `autoStart: true` requires either `@lightpanda/browser` installed or `lightpandaPath` pointing to a valid binary. If neither is present, throws immediately using `_throwAugmentedLaunchError()` with install instructions.
- If the Lightpanda process exits mid-crawl with a non-zero code, the crawler treats it as a fatal error — no silent retries.
- **Startup race condition**: `connectOverCDP` must not be called until Lightpanda is accepting TCP connections. A polling loop (e.g. `net.createConnection`) with a timeout is required between process spawn and connect.

## Open Questions

- Does `@lightpanda/browser`'s `serve()` API expose enough lifecycle events (process exit, ready signal) to manage the process reliably, or will direct `child_process.spawn` be required as the primary mechanism?
