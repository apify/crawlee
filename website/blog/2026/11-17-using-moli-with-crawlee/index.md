---
slug: using-moli-with-crawlee
title: Using Moli with Crawlee
description: Connect Crawlee to a local Moli browser, extract JavaScript-rendered quotes, and add a page to the queue while the crawl is running.
authors: [Lexmount]
---

View the source of the JavaScript edition of Quotes to Scrape and you'll find an array of quotes. A page script turns them into `.quote` elements. In this tutorial, Moli runs that script while Crawlee manages the queue. You'll start with three URLs, add a fourth from inside the request handler, and save the quotes and their authors to JSON.

<!-- truncate -->

## Start a local Moli browser

We tested on Apple Silicon with Node.js `22.23.4`, Moli `1.1.25`, Crawlee `4.0.0-rc.2`, and Playwright `1.65.1`. The `remoteBrowser` option used here comes from Crawlee v4. Use the pinned release candidate to follow along. [Crawlee remote browser guide](https://crawlee.dev/js/docs/next/guides/remote-browser)

Download the macOS ARM64 archive (`moli-aarch64-apple-darwin.tar.gz`), extract it, and put the `moli` executable on your `PATH`. In one terminal, start Moli and leave it running. [Moli 1.1.25 release](https://github.com/lexmount/moli/releases/tag/v1.1.25)

```sh
moli --version
moli serve --host 127.0.0.1 --port 19222 --layout --resource
```

If your network requires an outbound HTTP proxy, set `PROXY_URL` to its address and append `--http-proxy "$PROXY_URL"` to the `moli serve` command. Keep the CDP connection to `127.0.0.1` local.

In a second terminal, check that `/json/version` reports `Moli-Version` as `1.1.25`. Then create the project. Playwright will connect to the browser you just started over the Chrome DevTools Protocol (CDP).

```sh
curl -fsS http://127.0.0.1:19222/json/version
node --version
mkdir moli-crawlee && cd moli-crawlee
npm init -y
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --save-exact crawlee@4.0.0-rc.2 playwright@1.65.1
```

## Read the quotes and queue a fourth page

Save the following as `crawl.mjs`. The three seed URLs give you a JavaScript-rendered page, a plain HTML page, and the Quotes to Scrape home page. When the handler reaches the home page, it adds the `love` tag page to Crawlee's queue. The crawler uses one browser connection and handles one request at a time.

```js
import { writeFile } from 'node:fs/promises';
import { PlaywrightCrawler } from 'crawlee';

const home = 'https://quotes.toscrape.com/';
const rows = [];
const crawler = new PlaywrightCrawler({
    remoteBrowser: { endpoint: 'http://127.0.0.1:19222', protocol: 'cdp', maxOpenBrowsers: 1 },
    maxConcurrency: 1,
    navigationTimeoutSecs: 60,
    requestHandlerTimeoutSecs: 60,
    async requestHandler({ page, request, response }) {
        if (response?.status() !== 200) throw new Error(`Unexpected response for ${request.url}`);
        if (request.url.startsWith(home)) {
            await page.waitForFunction(() => document.querySelectorAll('.quote').length === 10);
        }
        const data = await page.evaluate(() => ({
            title: document.title,
            quotes: Array.from(document.querySelectorAll('.quote'), (item) => ({
                text: item.querySelector('.text').textContent.trim(),
                author: item.querySelector('.author').textContent.trim(),
            })),
        }));
        if (request.url === home) await crawler.addRequests([`${home}tag/love/`]);
        rows.push({ url: request.url, retries: request.retryCount, ...data });
    },
});

await crawler.run([`${home}js/`, 'https://example.com/', home]);
if (rows.length !== 4) throw new Error(`Expected four pages, got ${rows.length}`);
await writeFile(process.argv[2] ?? 'results.json', JSON.stringify(rows, null, 2) + '\n');
```

Only the quote pages need the wait. A successful HTTP response tells you the document arrived. Waiting for ten `.quote` elements tells you the data is ready to read. The count is specific to these three demo pages. For another site, choose a selector and a readiness condition that match its content.

## Run it twice and inspect the output

Leave Moli running in the first terminal. In the project terminal, save each run to its own file and print the fields you need to check the second run.

```sh
node crawl.mjs run-1.json
node crawl.mjs run-2.json
node -e "for (const r of require('./run-2.json')) console.log(r.url, r.quotes.length, r.retries)"
```

| URL | Quotes | Retries |
| --- | ---: | ---: |
| `https://quotes.toscrape.com/js/` | 10 | 0 |
| `https://example.com/` | 0 | 0 |
| `https://quotes.toscrape.com/` | 10 | 0 |
| `https://quotes.toscrape.com/tag/love/` | 10 | 0 |

Both runs returned four records. On our first run, Crawlee retried the JavaScript page once. The table shows the second run. In the JSON, the JavaScript page has the title `Quotes to Scrape` and its first quote has `Albert Einstein` in the `author` field. Seeing the tag URL in the same file confirms that the request added during the crawl was processed. Stop Moli with Ctrl+C in the first terminal when you're done.

## How much memory did the browser use?

In a separate measurement, the Moli team started fresh Moli and headless Chrome processes on an Apple M4 Pro with 48 GiB of RAM. Each browser read the same three pages in sequence at concurrency one. Both extracted the same fields. The table shows the sum of resident memory (RSS) across each browser's processes immediately after extraction.

| Page, in visit order | Moli 1.1.25 | Chrome 157.0.8103.79 |
| --- | ---: | ---: |
| MDN Array reference | 168 MiB | 1,206 MiB |
| Crawlee introduction | 178 MiB | 1,317 MiB |
| Coursera Python course listings | 184 MiB | 1,452 MiB |

Moli's browser processes had lower RSS at all three sampling points. The three-page crawl took 27.5 seconds with Moli and 20.4 seconds with Chrome. Later samples include memory retained from earlier pages. Summing RSS can count shared memory twice, and each snapshot excludes Crawlee's Node.js process. For a crawl with more simultaneous pages or a persistent login, measure that workload separately.
