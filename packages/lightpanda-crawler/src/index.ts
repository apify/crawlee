/**
 * Lightpanda-powered headless browser crawling for Crawlee.
 *
 * This package provides {@apilink LightpandaCrawler}, which extends {@apilink BrowserCrawler}
 * with support for the [Lightpanda](https://lightpanda.io) browser — a fast, Zig-based headless
 * browser designed for agentic AI workflows and high-throughput web scraping.
 *
 * Lightpanda communicates via the Chrome DevTools Protocol (CDP), and Crawlee connects to it
 * using Playwright's `chromium.connectOverCDP()`.
 *
 * > **Platform Note:** Lightpanda is currently only supported on **Linux**.
 *
 * ## Key Features
 *
 * - **Standard Playwright API**: Use the familiar `Page` API you already know
 * - **Lightweight & Fast**: Lightpanda has a smaller memory footprint than Chromium
 * - **Automatic process management**: Crawlee starts and stops Lightpanda automatically
 * - **Proxy support**: Proxy URL is passed as `--http_proxy` to the Lightpanda process
 *
 * @example
 * ```typescript
 * import { LightpandaCrawler } from '@crawlee/lightpanda';
 *
 * const crawler = new LightpandaCrawler({
 *   async requestHandler({ page, request, enqueueLinks, log }) {
 *     log.info(`Crawling ${request.url}`);
 *     await enqueueLinks();
 *     const title = await page.title();
 *     await this.pushData({ url: request.url, title });
 *   },
 * });
 *
 * await crawler.run(['https://example.com']);
 * ```
 *
 * @module @crawlee/lightpanda
 */

export * from '@crawlee/browser';

export {
    LightpandaCrawler,
    createLightpandaRouter,
} from './internals/lightpanda-crawler';

export type {
    LightpandaCrawlingContext,
    LightpandaGotoOptions,
    LightpandaHook,
    LightpandaRequestHandler,
    LightpandaCrawlerOptions,
} from './internals/lightpanda-crawler';

export type { LightpandaLaunchContext } from './internals/lightpanda-launcher';
export { launchLightpanda } from './internals/lightpanda-launcher';

export { LightpandaPlugin } from './internals/lightpanda-plugin';
export type { LightpandaPluginOptions, LightpandaConfig } from './internals/lightpanda-plugin';
