---
slug: crawlee-with-obscura
title: 'Using Obscura as a remote browser for Crawlee'
description: 'Obscura is a Rust headless browser that exposes a CDP endpoint. Crawlee drives it through PlaywrightCrawler and the remoteBrowser option, with no local Chromium.'
authors: [JindrichB]
---

[Obscura](https://github.com/h4ckf0r0day/obscura) is a headless browser written in Rust and distributed as a single binary. It runs JavaScript in V8 and exposes a Chrome DevTools Protocol endpoint.

Crawlee attaches to any CDP endpoint through the [`remoteBrowser`](https://crawlee.dev/js/api/browser-crawler/interface/BrowserCrawlerOptions#remoteBrowser) option. No local browser is launched.

<!-- truncate -->

## Running the CDP server

The `serve` command starts the CDP server, listening on port 9222 by default.

```bash
obscura serve --port 9222
```

The `--stealth` flag enables a consistent browser fingerprint and TLS impersonation. The [Obscura documentation](https://docs.obscura.sh) covers the remaining flags.

## Connecting Crawlee

[`PlaywrightCrawler`](https://crawlee.dev/js/api/playwright-crawler/class/PlaywrightCrawler) takes the endpoint on [`remoteBrowser`](https://crawlee.dev/js/api/browser-crawler/interface/BrowserCrawlerOptions#remoteBrowser). The `cdp` protocol selects Playwright's `connectOverCDP()` and is also the default.

```typescript
import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    remoteBrowser: {
        endpoint: 'http://127.0.0.1:9222',
        connection: { protocol: 'cdp' },
    },
    maxConcurrency: 1,
    maxRequestsPerCrawl: 20,
    requestHandler: async ({ request, enqueueLinks, log }) => {
        log.info(`crawled ${request.loadedUrl}`);

        await enqueueLinks({ strategy: 'same-hostname' });
    },
});

await crawler.run(['https://crawlee.dev/']);
```

The crawler above is limited to a single concurrent request. The next section covers the reason.

## Concurrency

Obscura serves one page per CDP connection. Two Crawlee pages on a single connection overwrite each other's execution context.

Concurrency therefore requires one connection per page. [`remotePlaywrightBrowserPool`](https://crawlee.dev/js/api/playwright-crawler/function/remotePlaywrightBrowserPool) exposes the pool options that enforce this, and returns a [`RemoteBrowserPool`](https://crawlee.dev/js/api/browser-pool/class/RemoteBrowserPool).

```typescript
import { PlaywrightCrawler, remotePlaywrightBrowserPool } from 'crawlee';

const browserPool = remotePlaywrightBrowserPool({
    endpoint: 'http://127.0.0.1:9222',
    connection: { protocol: 'cdp' },
    maxOpenBrowsers: 4,
    browserPoolOptions: {
        maxOpenPagesPerBrowser: 1,
        retireBrowserAfterPageCount: 1,
    },
});

const crawler = new PlaywrightCrawler({
    browserPool,
    maxConcurrency: 4,
    maxRequestsPerCrawl: 20,
    requestHandler: async ({ request, enqueueLinks, log }) => {
        log.info(`crawled ${request.loadedUrl}`);

        await enqueueLinks({ strategy: 'same-hostname' });
    },
});

await crawler.run(['https://crawlee.dev/']);
await browserPool.destroy();
```

[`maxOpenPagesPerBrowser`](https://crawlee.dev/js/api/browser-pool/interface/BrowserPoolOptions#maxOpenPagesPerBrowser) keeps a single page on each connection. [`retireBrowserAfterPageCount`](https://crawlee.dev/js/api/browser-pool/interface/BrowserPoolOptions#retireBrowserAfterPageCount) then closes it, so every request gets a fresh connection.

A pool built by the factory is not owned by the crawler, which is what makes it shareable. Closing it is therefore explicit.

## Fingerprints and screenshots

Crawlee skips fingerprint injection on remote connections. Obscura's own `--stealth` fingerprint stays intact.

Screenshots require an Obscura build with the `render` feature. Builds without it reject `Page.captureScreenshot`.
