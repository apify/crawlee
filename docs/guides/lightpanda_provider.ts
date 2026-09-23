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

/**
 * Starts one Lightpanda process per browser. Lightpanda sets its proxy per process,
 * so this is what lets each browser use the proxy Crawlee picked for it.
 */
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
        // Start a fresh process for every page, so each page can use a different proxy.
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
// The crawler does not destroy a pool passed as `browserPool`.
await browserPool.destroy();
