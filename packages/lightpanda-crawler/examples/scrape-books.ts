/**
 * Lightpanda crawler example — scrape books from books.toscrape.com
 *
 * This script crawls the catalogue at https://books.toscrape.com, extracts
 * book titles, prices and star ratings from every page, and follows the
 * "next" pagination link until all pages are visited.
 *
 * Run on Linux with Lightpanda installed:
 *
 *   # Option A — auto-start via @lightpanda/browser npm package
 *   npm install @lightpanda/browser
 *   npx tsx scrape-books.ts
 *
 *   # Option B — explicit binary path
 *   LIGHTPANDA_PATH=/usr/local/bin/lightpanda npx tsx scrape-books.ts
 *
 *   # Option C — pre-running Lightpanda server (./lightpanda serve --port 9222)
 *   LIGHTPANDA_AUTO_START=false npx tsx scrape-books.ts
 */

import { Dataset, log, LogLevel } from '@crawlee/core';
import { LightpandaCrawler } from '@crawlee/lightpanda';

log.setLevel(LogLevel.INFO);

// ── Configuration ────────────────────────────────────────────────────────────

const LIGHTPANDA_PATH = process.env.LIGHTPANDA_PATH;
const AUTO_START = process.env.LIGHTPANDA_AUTO_START !== 'false';
const START_URL = 'https://books.toscrape.com/catalogue/page-1.html';

interface BookRecord {
    url: string;
    title: string;
    price: string;
    rating: string;
    inStock: boolean;
}

// ── Crawler ──────────────────────────────────────────────────────────────────

const crawler = new LightpandaCrawler({
    launchContext: {
        lightpandaConfig: {
            host: '127.0.0.1',
            port: 9222,
            autoStart: AUTO_START,
            ...(LIGHTPANDA_PATH ? { lightpandaPath: LIGHTPANDA_PATH } : {}),
        },
    },

    // Lightpanda assigns the same CDP target ID (FID-0000000001) to every new
    // page within a session, which causes Playwright to throw "Duplicate target"
    // when a second page is opened in the same browser instance. To work around
    // this, we handle all pagination within a single requestHandler session
    // using page.goto() instead of enqueueLinks().
    maxConcurrency: 1,
    // Retries cause a Playwright "Duplicate target" crash when Lightpanda reuses
    // the same CDP target ID (FID-0000000001) for every new session.
    maxRequestRetries: 0,
    requestHandlerTimeoutSecs: 300,

    async requestHandler({ page, request, pushData, log: reqLog }) {
        let currentUrl: string = request.url;
        let pageNum = 1;

        while (currentUrl) {
            reqLog.info(`Scraping page ${pageNum}: ${currentUrl}`);

            if (pageNum > 1) {
                await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            }
            // books.toscrape.com is static HTML — all article elements are present
            // in the DOM after domcontentloaded. Playwright's waitForSelector injects
            // a custom selector engine that requires DOM APIs not yet supported by
            // Lightpanda, so we skip it and go straight to evaluate().

            // ── Extract book data ──────────────────────────────────────────────
            const books: BookRecord[] = await page.evaluate(() => {
                const ratingWords: Record<string, string> = {
                    One: '1', Two: '2', Three: '3', Four: '4', Five: '5',
                };

                return Array.from(document.querySelectorAll('article.product_pod')).map((el) => {
                    const titleEl = el.querySelector('h3 a');
                    const priceEl = el.querySelector('p.price_color');
                    const ratingEl = el.querySelector('p.star-rating');
                    const stockEl = el.querySelector('p.availability');

                    const ratingClass = ratingEl?.className.replace('star-rating', '').trim() ?? '';

                    return {
                        url: (titleEl as HTMLAnchorElement | null)?.href ?? '',
                        title: titleEl?.getAttribute('title') ?? titleEl?.textContent?.trim() ?? '',
                        price: priceEl?.textContent?.trim() ?? '',
                        rating: ratingWords[ratingClass] ?? ratingClass,
                        inStock: (stockEl?.textContent?.trim() ?? '').toLowerCase().includes('in stock'),
                    };
                });
            });

            reqLog.info(`Found ${books.length} books on page ${pageNum}`);
            await pushData(books);

            // ── Follow pagination using page.goto() to avoid multi-target issues ──
            const nextUrl: string | null = await page.evaluate(() => {
                const nextLink = document.querySelector('li.next a') as HTMLAnchorElement | null;
                if (!nextLink) return null;
                return new URL(nextLink.href, 'https://books.toscrape.com/catalogue/').href;
            });

            currentUrl = nextUrl ?? '';
            pageNum++;
        }

        reqLog.info(`Pagination complete. Scraped ${pageNum - 1} pages.`);
    },

    failedRequestHandler({ request, log: reqLog }) {
        reqLog.error(`Request failed: ${request.url}`);
    },
});

// ── Run ───────────────────────────────────────────────────────────────────────

async function main() {
    await crawler.run([START_URL]);

    const dataset = await Dataset.open();
    const { items } = await dataset.getData();

    log.info(`\n✓ Crawl complete. Scraped ${items.length} books total.`);
    if (items.length > 0) {
        log.info('Sample (first 3 books):');
        for (const book of items.slice(0, 3)) {
            const b = book as BookRecord;
            log.info(`  ${b.rating}★  ${b.price}  ${b.title}`);
        }
    }
}

main().catch((err) => {
    log.error(String(err));
    process.exit(1);
});
