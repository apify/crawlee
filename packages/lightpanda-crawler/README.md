# @crawlee/lightpanda

[Lightpanda](https://lightpanda.io) browser integration for [Crawlee](https://crawlee.dev).

Lightpanda is a headless browser built from scratch for machines — no graphical rendering, instant startup, up to **10× faster** and **10× less memory** than Chrome. It is compatible with Playwright/Puppeteer via the Chrome DevTools Protocol (CDP).

## Installation

```sh
npm install @crawlee/lightpanda playwright
# Optional: let Crawlee manage the Lightpanda process automatically
npm install @lightpanda/browser
```

## Usage

```typescript
import { LightpandaCrawler } from '@crawlee/lightpanda';

const crawler = new LightpandaCrawler({
    async requestHandler({ page, request, log }) {
        log.info(`Processing ${request.url}`);
        const title = await page.title();
        log.info(`Title: ${title}`);
    },
});

await crawler.run(['https://example.com']);
```

### External Lightpanda server

If you manage the Lightpanda process yourself (e.g. in Docker):

```typescript
const crawler = new LightpandaCrawler({
    launchContext: {
        autoStart: false,
        host: '127.0.0.1',
        port: 9222,
    },
    async requestHandler({ page }) {
        const title = await page.title();
        console.log(title);
    },
});
```

## Requirements

- Lightpanda is **Linux-only** (as of March 2026).
- Either install `@lightpanda/browser` for automatic process management, or supply `lightpandaPath` pointing to a Lightpanda binary.
