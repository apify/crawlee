# Lightpanda Crawler — Examples

This folder contains runnable example scripts for `@crawlee/lightpanda`.

## scrape-books.ts

Crawls the entire [books.toscrape.com](https://books.toscrape.com) catalogue (50 pages, 1 000 books) and saves title, price, star rating and stock status to a Crawlee dataset.

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- [tsx](https://github.com/privatenumber/tsx) — `npm install -g tsx`
- A running Lightpanda CDP server (see options below)

### Running Lightpanda

#### Option A — Docker (recommended, works on any OS)

```bash
docker run -d --name lightpanda -p 9222:9222 lightpanda/browser:nightly
```

Then run the example with `autoStart` disabled:

```bash
LIGHTPANDA_AUTO_START=false tsx --tsconfig tsconfig.json scrape-books.ts
```

Stop the container when you're done:

```bash
docker rm -f lightpanda
```

#### Option B — Auto-start via `@lightpanda/browser` npm package (Linux only)

This option downloads and manages the Lightpanda binary automatically. It only works on Linux because Lightpanda native binaries are not yet available for macOS or Windows.

```bash
npm install @lightpanda/browser
tsx --tsconfig tsconfig.json scrape-books.ts
```

#### Option C — Explicit binary path (Linux only)

If you already have a Lightpanda binary installed:

```bash
LIGHTPANDA_PATH=/usr/local/bin/lightpanda tsx --tsconfig tsconfig.json scrape-books.ts
```

#### Option D — Pre-running Lightpanda server (Linux only)

Start the server manually, then point the crawler at it:

```bash
# Terminal 1
lightpanda serve --port 9222

# Terminal 2
LIGHTPANDA_AUTO_START=false tsx --tsconfig tsconfig.json scrape-books.ts
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LIGHTPANDA_AUTO_START` | `true` | Set to `false` to connect to an already-running Lightpanda server (required for Docker on macOS) |
| `LIGHTPANDA_PATH` | _(auto-detected)_ | Absolute path to the `lightpanda` binary (Option C) |

### Expected Output

The crawler logs progress as it navigates page by page:

```
INFO  LightpandaCrawler: Starting the crawler.
INFO  LightpandaCrawler: Scraping page 1: https://books.toscrape.com/catalogue/page-1.html
INFO  LightpandaCrawler: Found 20 books on page 1
INFO  LightpandaCrawler: Scraping page 2: https://books.toscrape.com/catalogue/page-2.html
...
INFO  LightpandaCrawler: Scraping page 50: https://books.toscrape.com/catalogue/page-50.html
INFO  LightpandaCrawler: Found 20 books on page 50
INFO  LightpandaCrawler: Pagination complete. Scraped 50 pages.
✓ Crawl complete. Scraped 1000 books total.
Sample: {"url":"...","title":"A Light in the Attic","price":"£51.77","rating":"3","inStock":true}
```

Results are saved to `storage/datasets/default/` as JSON files.

### Known Lightpanda Limitations

These limitations are specific to the current state of Lightpanda's CDP implementation and are reflected in the example code:

| Limitation | Workaround applied |
|---|---|
| Lightpanda reuses the same CDP target ID (`FID-0000000001`) for every new page within a session, causing Playwright to throw `Duplicate target` when a second page is opened | All pagination is handled inside a single request handler using `page.goto()` instead of `enqueueLinks()` |
| Playwright's `waitForSelector` injects a custom selector engine that uses DOM APIs not yet supported by Lightpanda | `waitForSelector` is omitted; `waitUntil: 'domcontentloaded'` + direct `page.evaluate()` is used instead |
| Retries reconnect to Lightpanda and trigger the duplicate-target crash | `maxRequestRetries: 0` is set |
