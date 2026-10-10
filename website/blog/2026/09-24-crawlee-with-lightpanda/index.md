---
slug: crawlee-with-lightpanda
title: 'Using Lightpanda as a remote browser for Crawlee'
tags: [community]
description: 'Lightpanda is a headless browser written in Zig that exposes a CDP endpoint. Crawlee drives it through PlaywrightCrawler or PuppeteerCrawler and a remote browser pool.'
authors: [CandidoS]
---

[Lightpanda](https://lightpanda.io/) is a headless browser written from scratch in Zig. It runs JavaScript in V8 but does not render pages, so it uses much less memory and CPU than headless Chrome. It exposes a Chrome DevTools Protocol (CDP) endpoint.

Crawlee connects to any CDP endpoint through its [remote browser](https://crawlee.dev/js/docs/guides/remote-browser) support, so `PlaywrightCrawler` and `PuppeteerCrawler` work with Lightpanda without a separate crawler class.

Lightpanda does not implement every web API that Chrome does. Test it on your target sites before you switch.

<!-- truncate -->

## Running the CDP server

Install Lightpanda with Homebrew, download a binary from the [releases page](https://github.com/lightpanda-io/browser/releases) (Linux and macOS), or run the Docker image.

```bash
brew install lightpanda-io/browser/lightpanda
lightpanda serve --host 127.0.0.1 --port 9222

# or
docker run -d --name lightpanda -p 127.0.0.1:9222:9222 lightpanda/browser:nightly
```

Some useful `serve` flags:

- `--obey-robots` fetches and follows the target site's `robots.txt`.
- `--load-resources iframe|worker|stylesheet|image` turns on loading of iframes, web workers, external stylesheets or images. Since Lightpanda 0.4.0, none of them load by default. Pass the flag once for each resource type.
- `--cdp-max-connections` sets the maximum number of simultaneous CDP connections. The default is 16.

Run `lightpanda help serve` for the full list.

## Connecting Crawlee

Lightpanda allows one browser context per CDP connection. Crawlee's browser pool opens several pages per browser by default, and the second page on a connection fails with `Cannot have more than one browser context at a time` in Playwright, or `TargetAlreadyLoaded` in Puppeteer. The short `remoteBrowser: { endpoint }` option keeps that default, so it does not work with Lightpanda.

[`remotePlaywrightBrowserPool`](https://crawlee.dev/js/api/playwright-crawler/function/remotePlaywrightBrowserPool) exposes the pool options. Set `maxOpenPagesPerBrowser: 1` so the pool opens a new connection for each concurrent page.

```typescript
import { PlaywrightCrawler, remotePlaywrightBrowserPool } from 'crawlee';

const browserPool = remotePlaywrightBrowserPool({
    endpoint: 'ws://127.0.0.1:9222',
    // Each browser is one CDP connection. Keep this at or below `--cdp-max-connections`.
    maxOpenBrowsers: 8,
    browserPoolOptions: {
        // One browser context per CDP connection, so one page per browser.
        maxOpenPagesPerBrowser: 1,
        useFingerprints: false,
    },
});

const crawler = new PlaywrightCrawler({
    browserPool,
    maxConcurrency: 8,
    async requestHandler({ page, request, enqueueLinks, log }) {
        log.info(`${request.loadedUrl} — "${await page.title()}"`);
        await enqueueLinks();
    },
});

await crawler.run(['https://crawlee.dev']);
await browserPool.destroy();
```

The crawler does not own a pool passed as `browserPool`, so you have to destroy it yourself.

For Puppeteer, use [`remotePuppeteerBrowserPool`](https://crawlee.dev/js/api/puppeteer-crawler/function/remotePuppeteerBrowserPool) with the same options.

## Proxies

Lightpanda sets its proxy for the whole process with the `--http-proxy` flag. One shared server cannot follow Crawlee's per-browser proxy rotation.

With a `ProxyConfiguration`, start one Lightpanda process per browser from a [`RemoteBrowserProvider`](https://crawlee.dev/js/api/browser-pool/class/RemoteBrowserProvider). The pool passes the proxy URL to `connect()` and calls `release()` when the browser closes, so the provider can stop the process.

```typescript
import { type ChildProcess, spawn } from 'node:child_process';
import net from 'node:net';

import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PlaywrightCrawler, ProxyConfiguration, remotePlaywrightBrowserPool } from 'crawlee';

async function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as net.AddressInfo;
            server.close(() => resolve(port));
        });
    });
}

async function waitForCdp(port: number, timeoutMillis = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMillis;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (response.ok) return;
        } catch {
            // Not listening yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Lightpanda did not start on port ${port} within ${timeoutMillis}ms.`);
}

class LightpandaProvider extends RemoteBrowserProvider<{ pid: number }> {
    readonly #processes = new Map<number, ChildProcess>();
    readonly #binaryPath: string;
    readonly #extraArgs: string[];

    constructor(binaryPath: string, extraArgs: string[] = []) {
        super();
        this.#binaryPath = binaryPath;
        this.#extraArgs = extraArgs;
    }

    async connect({ proxyUrl }: { proxyUrl?: string } = {}) {
        const port = await getFreePort();
        const args = ['serve', '--host', '127.0.0.1', '--port', String(port), ...this.#extraArgs];
        if (proxyUrl) args.push('--http-proxy', proxyUrl);

        const child = spawn(this.#binaryPath, args, { stdio: 'ignore' });
        this.#processes.set(child.pid!, child);

        try {
            await waitForCdp(port);
        } catch (error) {
            child.kill('SIGKILL');
            this.#processes.delete(child.pid!);
            throw error;
        }

        return { url: `ws://127.0.0.1:${port}`, context: { pid: child.pid! } };
    }

    override async release({ pid }: { pid: number }) {
        this.#processes.get(pid)?.kill();
        this.#processes.delete(pid);
    }
}

const browserPool = remotePlaywrightBrowserPool({
    endpoint: new LightpandaProvider(process.env.LIGHTPANDA_PATH ?? 'lightpanda', ['--obey-robots']),
    maxOpenBrowsers: 4,
    browserPoolOptions: {
        maxOpenPagesPerBrowser: 1,
        // A fresh process for every page, so each page can use a different proxy.
        retireBrowserAfterPageCount: 1,
        useFingerprints: false,
    },
});

const crawler = new PlaywrightCrawler({
    proxyConfiguration: new ProxyConfiguration({
        proxyUrls: ['http://proxy-1.example.com:8000', 'http://proxy-2.example.com:8000'],
    }),
    browserPool,
    maxConcurrency: 4,
    async requestHandler({ page, request, log }) {
        log.info(`${request.loadedUrl} — "${await page.title()}"`);
    },
});

await crawler.run(['https://crawlee.dev']);
await browserPool.destroy();
```

[`retireBrowserAfterPageCount: 1`](https://crawlee.dev/js/api/browser-pool/interface/BrowserPoolOptions#retireBrowserAfterPageCount) closes each browser after one page, so every request gets a new process with the proxy Crawlee picked for it.

The examples were tested with Lightpanda 0.4.1, with both Playwright and Puppeteer.
