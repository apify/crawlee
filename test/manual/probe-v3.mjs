// Same matrix as the v4 probe, ported to crawlee v3.
//
// Run from a directory that has crawlee@3 installed, e.g.
//   mkdir /tmp/v3 && cd /tmp/v3
//   echo '{"type":"module","dependencies":{"crawlee":"^3.17.0","playwright":"^1.55.1"}}' > package.json
//   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
//   cp <this-file> ./probe.mjs && node probe.mjs
//
// In v3 the knobs are:
//   - sessionPoolOptions.blockedStatusCodes  (was added in 3.0.2 — see issue #812 comment)
//   - additionalHttpErrorStatusCodes / ignoreHttpErrorStatusCodes  (HttpCrawler-only)
//   - retryOnBlocked
// Browser crawlers in v3 only honor blockedStatusCodes and never throw on 5xx.

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { CheerioCrawler, PlaywrightCrawler, log, LogLevel } from 'crawlee';

const STATUS_CODES = [200, 301, 404, 401, 403, 429, 500, 503];

const SUITES = [
    { id: 'cheerio',                   label: 'CheerioCrawler (default)' },
    { id: 'cheerio-no-blocked',        label: 'CheerioCrawler { sessionPoolOptions.blockedStatusCodes: [] }' },
    { id: 'cheerio-ignore-5xx',        label: 'CheerioCrawler { ignoreHttpErrorStatusCodes: [500, 503] }' },
    { id: 'cheerio-additional-404',    label: 'CheerioCrawler { additionalHttpErrorStatusCodes: [404] }' },
    { id: 'cheerio-retryOnBlocked',    label: 'CheerioCrawler { retryOnBlocked: true }' },
    { id: 'playwright',                label: 'PlaywrightCrawler (default)' },
    { id: 'playwright-no-blocked',     label: 'PlaywrightCrawler { sessionPoolOptions.blockedStatusCodes: [] }' },
    { id: 'playwright-ignore-5xx',     label: 'PlaywrightCrawler { ignoreHttpErrorStatusCodes: [500, 503] }  (NOT in v3 API!)' },
    { id: 'playwright-additional-404', label: 'PlaywrightCrawler { additionalHttpErrorStatusCodes: [404] }  (NOT in v3 API!)' },
    { id: 'playwright-retryOnBlocked', label: 'PlaywrightCrawler { retryOnBlocked: true }' },
];

function findChromium() {
    const root = '/opt/pw-browsers';
    try {
        const entry = readdirSync(root).find((d) => d.startsWith('chromium-'));
        if (!entry) return null;
        return `${root}/${entry}/chrome-linux/chrome`;
    } catch { return null; }
}

function startServer(port) {
    const hits = new Map();
    const server = createServer((req, res) => {
        const m = req.url?.match(/^\/status\/(\d{3})/);
        const status = m ? Number(m[1]) : 200;
        hits.set(req.url, (hits.get(req.url) ?? 0) + 1);

        if (status >= 300 && status < 400) {
            res.writeHead(status, { Location: `http://127.0.0.1:${port}/redirected` });
            res.end();
            return;
        }
        res.writeHead(status, { 'content-type': 'text/html' });
        res.end(`<html><body><h1>${status}</h1></body></html>`);
    });
    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => resolve({ server, hits }));
    });
}

function makeCrawler(suiteId, handlers) {
    const common = {
        ...handlers,
        maxRequestRetries: 1,
        requestHandlerTimeoutSecs: 20,
        navigationTimeoutSecs: 20,
    };
    const browser = (extra) => new PlaywrightCrawler({
        ...common,
        ...extra,
        launchContext: { launchOptions: { executablePath: findChromium(), headless: true } },
    });
    switch (suiteId) {
        case 'cheerio':                    return new CheerioCrawler(common);
        case 'cheerio-no-blocked':         return new CheerioCrawler({ ...common, sessionPoolOptions: { blockedStatusCodes: [] } });
        case 'cheerio-ignore-5xx':         return new CheerioCrawler({ ...common, ignoreHttpErrorStatusCodes: [500, 503] });
        case 'cheerio-additional-404':     return new CheerioCrawler({ ...common, additionalHttpErrorStatusCodes: [404] });
        case 'cheerio-retryOnBlocked':     return new CheerioCrawler({ ...common, retryOnBlocked: true, maxRequestRetries: 2 });
        case 'playwright':                 return browser({});
        case 'playwright-no-blocked':      return browser({ sessionPoolOptions: { blockedStatusCodes: [] } });
        case 'playwright-ignore-5xx':      return browser({ ignoreHttpErrorStatusCodes: [500, 503] });
        case 'playwright-additional-404':  return browser({ additionalHttpErrorStatusCodes: [404] });
        case 'playwright-retryOnBlocked':  return browser({ retryOnBlocked: true, maxRequestRetries: 2 });
        default: throw new Error(`unknown suite: ${suiteId}`);
    }
}

async function runChild() {
    log.setLevel(LogLevel.OFF);
    const suiteId = process.env.SUITE;
    const port = Number(process.env.PORT);

    const results = Object.create(null);
    for (const code of STATUS_CODES) results[code] = { handler: 0, failed: 0, errorMsg: null };

    let crawler;
    try {
        crawler = makeCrawler(suiteId, {
            requestHandler: async ({ request }) => {
                const code = request.userData.expected;
                results[code].handler += 1;
            },
            failedRequestHandler: async ({ request }, error) => {
                const code = request.userData.expected;
                results[code].failed += 1;
                results[code].errorMsg = String(error?.message ?? error).split('\n')[0].slice(0, 140);
            },
        });
    } catch (err) {
        process.stdout.write(`__RESULT__${JSON.stringify({ __ctorError: err.message })}\n`);
        return;
    }

    const sources = STATUS_CODES.map((code) => ({
        url: `http://127.0.0.1:${port}/status/${code}`,
        userData: { expected: code },
    }));

    try {
        await crawler.run(sources);
    } catch (err) {
        process.stderr.write(`child[${suiteId}] crawler.run threw: ${err.message}\n`);
    } finally {
        await crawler.teardown?.().catch(() => {});
    }

    process.stdout.write(`\n__RESULT__${JSON.stringify(results)}\n`);
}

function formatTable(label, rows) {
    console.log(`\n=== ${label} ===`);
    console.log('status | reqHandler | failedHandler | server-hits | error');
    console.log('-------+------------+---------------+-------------+--------------------------------------------');
    for (const r of rows) {
        console.log(
            `${String(r.code).padEnd(6)} | ${String(r.handler).padEnd(10)} | ${String(r.failed).padEnd(13)} | ${String(r.attempts).padEnd(11)} | ${r.error ?? ''}`,
        );
    }
}

async function runParent() {
    const PORT = 38223;
    const { server, hits } = await startServer(PORT);
    const SELF = fileURLToPath(import.meta.url);
    const allRows = [];

    for (const suite of SUITES) {
        hits.clear();
        const child = spawn(process.execPath, [SELF, '--child'], {
            env: { ...process.env, SUITE: suite.id, PORT: String(PORT), PLAYWRIGHT_BROWSERS_PATH: '/opt/pw-browsers' },
            stdio: ['ignore', 'pipe', 'inherit'],
        });
        let stdout = '';
        child.stdout.on('data', (b) => { stdout += b.toString(); });
        const exitCode = await new Promise((resolve) => child.on('exit', resolve));
        if (exitCode !== 0) {
            console.error(`child for ${suite.id} exited with code ${exitCode}`);
            continue;
        }
        const m = stdout.match(/__RESULT__(\{.*\})/);
        if (!m) {
            console.error(`child for ${suite.id} produced no result`);
            continue;
        }
        const parsed = JSON.parse(m[1]);
        if (parsed.__ctorError) {
            console.log(`\n=== ${suite.label} ===`);
            console.log(`(constructor rejected option) ${parsed.__ctorError}`);
            allRows.push({ label: suite.label, rejected: parsed.__ctorError });
            continue;
        }
        const rows = STATUS_CODES.map((code) => ({
            code,
            handler: parsed[code].handler,
            failed: parsed[code].failed,
            attempts: (hits.get(`/status/${code}`) ?? 0),
            error: parsed[code].errorMsg,
        }));
        formatTable(suite.label, rows);
        allRows.push({ label: suite.label, rows });
    }

    server.close();

    console.log('\n--- summary (handler / failed / server-hits) ---');
    const header = ['status', ...allRows.map(({ label }) => label.replace(/Crawler\s+/, '').slice(0, 28))];
    console.log(header.join(' | '));
    for (const code of STATUS_CODES) {
        const cells = [String(code)];
        for (const a of allRows) {
            if (a.rejected) { cells.push('rejected'); continue; }
            const r = a.rows.find((x) => x.code === code);
            cells.push(`h${r.handler}/f${r.failed}/n${r.attempts}`);
        }
        console.log(cells.join(' | '));
    }
}

if (process.argv.includes('--child')) {
    runChild().catch((e) => { console.error(e); process.exit(1); });
} else {
    runParent().catch((e) => { console.error(e); process.exit(1); });
}
