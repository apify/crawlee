import http from 'node:http';
import { CheerioCrawler, Configuration } from 'crawlee';

// Disable persistent storage noise between runs
Configuration.getGlobalConfig().set('persistStorage', false);
Configuration.getGlobalConfig().set('purgeOnStart', true);

// Minimal local HTTP server so we don't depend on external sites.
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body><h1>Hello for ${req.url}</h1></body></html>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const NUM_URLS = 10;
const MAX_USAGE_COUNT = 1;
const urls = Array.from({ length: NUM_URLS }, (_, i) => `${base}/page?key=${i}`);

// Stats collected inside the request handler — the "ground truth" of how many
// times a session was actually *handed out*.
const handedOut = new Map();

const crawler = new CheerioCrawler({
    useSessionPool: true,
    persistCookiesPerSession: false,
    sessionPoolOptions: {
        sessionOptions: {
            maxUsageCount: MAX_USAGE_COUNT,
        },
    },
    async requestHandler({ request, session }) {
        if (!session) return;
        const prev = handedOut.get(session.id) ?? { count: 0, urls: [] };
        prev.count += 1;
        prev.urls.push(request.url);
        handedOut.set(session.id, prev);
    },
});

await crawler.run(urls);

// Introspect the session pool directly to read the final usage counts per session.
const poolState = await crawler.sessionPool.getState();

server.close();

console.log('================ ISSUE 1836 — crawlee v3 ================');
console.log(`URLs crawled:              ${NUM_URLS}`);
console.log(`maxUsageCount configured:  ${MAX_USAGE_COUNT}`);
console.log(`Sessions handed out to handler: ${handedOut.size}`);
console.log(`Total sessions in pool:    ${poolState.sessions.length}`);
console.log(`Usable sessions in pool:   ${poolState.usableSessionsCount}`);
console.log(`Retired sessions in pool:  ${poolState.retiredSessionsCount}`);

const overuseRows = poolState.sessions
    .filter((s) => s.usageCount > MAX_USAGE_COUNT)
    .map((s) => ({ id: s.id, usageCount: s.usageCount, errorScore: s.errorScore }));
console.log(`Sessions where usageCount > maxUsageCount: ${overuseRows.length}`);
if (overuseRows.length > 0) {
    console.table(overuseRows);
}

console.log('\nPer-session handler-observed usage (sorted by count):');
console.table(
    [...handedOut.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([id, v]) => ({ id, handedOutCount: v.count })),
);

console.log('\nFull pool state (id / usageCount / maxUsageCount / errorScore):');
console.table(
    poolState.sessions.map((s) => ({
        id: s.id,
        usageCount: s.usageCount,
        maxUsageCount: s.maxUsageCount,
        errorScore: s.errorScore,
    })),
);
