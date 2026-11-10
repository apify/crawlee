import { getStats, harness, scenario } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { default: http } = await import('node:http');
    const { PlaywrightCrawler } = await import('@crawlee/playwright');
    const { Actor } = await import('apify');

    // Self-contained fixture: robots.txt disallows /cart and /checkout, and the
    // start page links to /cart alongside the allowed /collections/* pages. The
    // crawler may only reach the collections.
    const pages: Record<string, string> = {
        '/robots.txt': ['User-agent: *', 'Disallow: /cart', 'Disallow: /checkout', ''].join('\n'),
        '/': `<!doctype html>
<html><head><title>Store</title></head>
<body>
    <a href="/cart">Cart</a>
    <a href="/collections/audio">Audio</a>
    <a href="/collections/tv">TV</a>
</body></html>`,
        // Every collection links back to /cart, so the robots.txt rule is what keeps
        // it out of the dataset rather than a shortage of links to follow.
        '/collections/audio': `<!doctype html>
<html><head><title>Audio</title></head>
<body><a href="/cart">Cart</a> <a href="/">Home</a></body></html>`,
        '/collections/tv': `<!doctype html>
<html><head><title>TV</title></head>
<body><a href="/cart">Cart</a> <a href="/">Home</a></body></html>`,
        '/cart': '<!doctype html><html><head><title>Cart</title></head><body>Cart</body></html>',
        '/checkout': '<!doctype html><html><head><title>Checkout</title></head><body>Checkout</body></html>',
    };

    const server = http.createServer((req, res) => {
        const body = pages[req.url!];
        if (body === undefined) {
            res.statusCode = 404;
            res.end('Not Found');
            return;
        }
        const type = req.url === '/robots.txt' ? 'text/plain' : 'text/html';
        res.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
        res.end(body);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${port}`;

    await Actor.init();

    const crawler = new PlaywrightCrawler({
        maxRequestsPerCrawl: 10,
        respectRobotsTxtFile: true,
    });

    crawler.router.addDefaultHandler(async ({ log, request, enqueueLinks, pushData }) => {
        log.info(`Processing ${request.loadedUrl}`);
        await enqueueLinks({
            // '/cart' is disallowed by robots.txt
            include: ['**/cart', '**/collections/*'],
        });
        await pushData({ url: request.url, loadedUrl: request.loadedUrl });
    });

    await crawler.run([
        baseUrl,
        `${baseUrl}/checkout`, // '/checkout' is disallowed by robots.txt
    ]);

    const data = await crawler.getData();
    console.table(data.items);

    server.close();

    await Actor.exit({ exit: Actor.isAtHome() });
};

test('playwright-robots-file', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('playwright-robots-file', {
        source: scenario(import.meta.filename, main, { image: 'playwright' }),
        memory: 16384,
    });
    const result = await runActor(actor);
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    // Without this the two assertions below hold vacuously when the crawl never starts.
    expect(stats.requestsSucceeded).toBeGreaterThanOrEqual(1);
    const paths = items.map((item) => new URL(item.url).pathname);
    expect(paths).not.toContain('/cart');
    expect(paths).not.toContain('/checkout');
});
