import http from 'node:http';

import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset } from '@crawlee/playwright';

// Self-contained fixture: a start page that uses <base href="/sub/"> so the
// crawler can only discover the linked pages if it honors the base href when
// resolving the otherwise-relative <a href> values.
const pages = {
    '/start': `<!doctype html>
<html><head><title>Start</title><base href="/sub/"></head>
<body>
    <a href="a">A</a>
    <a href="b">B</a>
    <a href="c">C</a>
    <a href="/elsewhere">Elsewhere (absolute)</a>
</body></html>`,
    '/sub/a': '<!doctype html><html><head><title>A</title></head><body>A</body></html>',
    '/sub/b': '<!doctype html><html><head><title>B</title></head><body>B</body></html>',
    '/sub/c': '<!doctype html><html><head><title>C</title></head><body>C</body></html>',
    '/elsewhere': '<!doctype html><html><head><title>Elsewhere</title></head><body>Elsewhere</body></html>',
};

const server = http.createServer((req, res) => {
    const body = pages[req.url];
    if (body === undefined) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

await Actor.main(async () => {
    const crawler = new PlaywrightCrawler({
        maxRequestsPerCrawl: 30,
        async requestHandler({ parseWithCheerio, enqueueLinks, request, log }) {
            const { url, loadedUrl } = request;

            const $ = await parseWithCheerio('title', 1_000);
            const pageTitle = $('title').first().text();
            log.info(`URL: ${url}; LOADED_URL: ${loadedUrl}; TITLE: ${pageTitle}`);
            await Dataset.pushData({ url, loadedUrl, pageTitle });

            // Only the /sub/ links should match — the absolute /elsewhere link
            // and any unresolved relative URLs (which would land at /a, /b, /c
            // without base-href handling) are filtered out by the glob.
            await enqueueLinks({
                globs: [`${baseUrl}/sub/**`],
            });
        },
    });

    await crawler.run([`${baseUrl}/start`]);
}, mainOptions);

server.close();
