/**
 * Remote browser with custom proxy — demonstrates proxyUrl forwarding
 *
 * Shows how proxyUrl from Crawlee's ProxyConfiguration is forwarded to
 * the RemoteBrowserProvider.connect() method, letting the provider pass
 * it to the remote service's proxy API.
 *
 * Run local Browserless first:
 *   docker run -p 3000:3000 -e CONCURRENT=4 ghcr.io/browserless/chromium
 *
 * Then:
 *   npm run example:remote-proxy-test
 *
 * Note: externalProxyServer is a paid Browserless feature. On the free/local
 * Docker image the proxy is accepted but may not route traffic. The example
 * proves the forwarding plumbing works regardless.
 */
import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PuppeteerCrawler, ProxyConfiguration } from 'crawlee';

// ---------------------------------------------------------------------------
// Provider that forwards proxyUrl to Browserless via externalProxyServer param
// ---------------------------------------------------------------------------
class BrowserlessWithProxyProvider extends RemoteBrowserProvider {
    maxOpenBrowsers = 4;

    async connect({ proxyUrl } = {} as { proxyUrl?: string }) {
        let url = 'ws://localhost:3000';

        if (proxyUrl) {
            // Browserless accepts custom proxy via externalProxyServer query param
            // For other services, forward differently:
            //   Browserbase: proxies: [{ type: 'external', server: proxyUrl }]
            //   Steel: not supported (built-in only)
            //   Rebrowser: set on profile
            url += `?externalProxyServer=${encodeURIComponent(proxyUrl)}`;
            console.log(`  [Provider] Forwarding proxy to Browserless: ${proxyUrl}`);
        } else {
            console.log('  [Provider] No proxy provided');
        }

        return { url };
    }
}

// ---------------------------------------------------------------------------
// Proxy configuration — Crawlee rotates these per browser session
// ---------------------------------------------------------------------------
const proxyConfiguration = new ProxyConfiguration({
    proxyUrls: [
        'http://34.135.166.24:80',
        'http://8.219.97.248:80',
    ],
});

// ---------------------------------------------------------------------------
// Crawler
// ---------------------------------------------------------------------------
const crawler = new PuppeteerCrawler({
    launchContext: {
        remoteBrowser: new BrowserlessWithProxyProvider(),
    },
    proxyConfiguration,
    browserPoolOptions: {
        retireBrowserAfterPageCount: 2,
        maxOpenPagesPerBrowser: 1,
    },
    maxConcurrency: 1,
    maxRequestsPerCrawl: 4,
    async requestHandler({ page, request, proxyInfo }) {
        const title = await page.title();
        console.log(`[Page] ${request.loadedUrl} — "${title}" (proxy: ${proxyInfo?.url ?? 'none'})`);
    },
});

await crawler.run([
    'https://example.com',
    'https://books.toscrape.com',
    'https://quotes.toscrape.com',
    'https://httpbin.org/ip',
]);

console.log('\nDone.');
console.log('Check that [Provider] logs show the proxy URL being forwarded from ProxyConfiguration.');
