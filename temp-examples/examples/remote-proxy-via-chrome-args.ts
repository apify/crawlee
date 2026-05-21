/**
 * Remote browser with custom proxy via Chrome launch args
 *
 * Uses Browserless's `launch` query param to pass --proxy-server directly
 * to Chrome. Works on the free/local Docker image (no paid features needed).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SETUP STEPS
 * ──────────────────────────────────────────────────────────────────────────
 *
 * 1. Get your Apify Proxy password:
 *    - Go to https://console.apify.com/account/integrations
 *    - Copy "Proxy password" from the Proxy section
 *
 * 2. Add it to temp-examples/.env:
 *      APIFY_PROXY_PASSWORD=your_password_here
 *
 * 3. Start local Browserless Docker (free image):
 *      docker run -p 3000:3000 ghcr.io/browserless/chromium
 *
 * 4. Run the example:
 *      npm run example:remote-proxy-via-chrome-args
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT TO LOOK FOR
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Test target is httpbin.org/ip — it returns the IP making the request.
 * - If the proxy routes correctly, the "Response" line shows the proxy's IP
 *   (NOT your own home/office IP).
 * - With residential proxies, you should see different IPs on different
 *   requests if rotation is working.
 *
 * Without APIFY_PROXY_PASSWORD, the example falls back to a free public proxy
 * (unreliable, may fail) so you can still see the forwarding mechanism work.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * APIFY PROXY URL FORMAT
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Base: http://USERNAME:PASSWORD@proxy.apify.com:8000
 *
 * USERNAME options (combine with commas):
 *   - groups-RESIDENTIAL   → residential proxies
 *   - groups-AUTO          → auto-rotated datacenter (default)
 *   - groups-GOOGLE_SERP   → Google SERP-specific
 *   - country-US           → restrict to country (US, GB, DE, etc.)
 *   - session-myid123      → sticky session (same IP for same session)
 *
 * Examples:
 *   http://auto:PASSWORD@proxy.apify.com:8000
 *   http://groups-RESIDENTIAL,country-US:PASSWORD@proxy.apify.com:8000
 *   http://groups-RESIDENTIAL,session-abc:PASSWORD@proxy.apify.com:8000
 */
import 'dotenv/config';

import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PuppeteerCrawler, ProxyConfiguration } from 'crawlee';

// ---------------------------------------------------------------------------
// Provider that forwards proxyUrl to Chrome via --proxy-server launch arg
// ---------------------------------------------------------------------------
class BrowserlessChromeArgsProvider extends RemoteBrowserProvider {
    maxOpenBrowsers = 4;

    async connect({ proxyUrl } = {} as { proxyUrl?: string }) {
        let url = 'ws://localhost:3000';

        if (proxyUrl) {
            // Pass proxy to Chrome via launch args (works on free Browserless)
            const launchOpts = JSON.stringify({
                args: [`--proxy-server=${proxyUrl}`],
            });
            url += `?launch=${encodeURIComponent(launchOpts)}`;
            console.log(`  [Provider] Forwarding proxy via Chrome args: ${proxyUrl}`);
        } else {
            console.log('  [Provider] No proxy provided');
        }

        return { url };
    }
}

// ---------------------------------------------------------------------------
// Proxy configuration — use Apify Proxy or any HTTP proxy
// ---------------------------------------------------------------------------
const apifyPassword = process.env.APIFY_PROXY_PASSWORD;

const proxyConfiguration = new ProxyConfiguration({
    proxyUrls: apifyPassword
        ? [
              // Apify residential proxy (replace 'RESIDENTIAL' with your group if different)
              `http://groups-RESIDENTIAL:${apifyPassword}@proxy.apify.com:8000`,
          ]
        : [
              // Fallback: free public proxies (unreliable, may not work)
              'http://34.135.166.24:80',
          ],
});

// ---------------------------------------------------------------------------
// Crawler
// ---------------------------------------------------------------------------
const crawler = new PuppeteerCrawler({
    launchContext: {
        remoteBrowser: new BrowserlessChromeArgsProvider(),
    },
    proxyConfiguration,
    browserPoolOptions: {
        retireBrowserAfterPageCount: 1, // new browser per request to test rotation
        maxOpenPagesPerBrowser: 1,
    },
    maxConcurrency: 1,
    maxRequestsPerCrawl: 2,
    async requestHandler({ page, request, proxyInfo }) {
        const body = await page.evaluate(() => document.body.textContent?.trim());
        console.log(`\n[${request.loadedUrl}]`);
        console.log(`  Configured proxy: ${proxyInfo?.url ?? 'none'}`);
        console.log(`  Response: ${body}`);
    },
});

await crawler.run([
    'https://httpbin.org/ip',
    'https://httpbin.org/ip',
]);

console.log('\nDone.');
console.log('Compare "Response" IP with your own IP to verify proxy routing.');
