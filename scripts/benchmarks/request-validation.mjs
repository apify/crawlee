// Throughput of the per-request validation paths. Run against a build: `pnpm build && node scripts/benchmarks/request-validation.mjs`.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const req = createRequire(new URL('../../packages/crawlee/package.json', import.meta.url));
const load = (specifier) => import(pathToFileURL(req.resolve(specifier)).href);
const { Request } = await load('@crawlee/core');
const { schemas } = await load('@crawlee/utils/internal');
const { z } = await load('zod');

const options = {
    url: 'https://example.com/products/123?page=2',
    uniqueKey: 'https://example.com/products/123?page=2',
    method: 'GET',
    userData: { label: 'DETAIL', depth: 3 },
    headers: { accept: 'text/html' },
};
const stored = { id: 'abc123', ...options, retryCount: 0 };
const batch = Array.from({ length: 100 }, (_, i) => ({
    ...options,
    url: `${options.url}&i=${i}`,
    uniqueKey: `${options.uniqueKey}&i=${i}`,
}));

function opsPerSecond(fn, minMs = 500) {
    for (let i = 0; i < 2000; i++) fn();
    let n = 0;
    const t0 = performance.now();
    let t;
    do {
        for (let i = 0; i < 1000; i++) fn();
        n += 1000;
        t = performance.now();
    } while (t - t0 < minMs);
    return n / ((t - t0) / 1000);
}
const best = (fn) => Math.round(Math.max(opsPerSecond(fn), opsPerSecond(fn), opsPerSecond(fn)));

console.table([
    { case: 'new Request(options)', 'ops/s': best(() => new Request(options)) },
    { case: 'storageRequest parse', 'ops/s': best(() => z.parse(schemas.storageRequest, stored)) },
    {
        case: 'storageRequestBatch parse (100 requests)',
        'ops/s': best(() => z.parse(schemas.storageRequestBatch, batch)),
    },
    {
        case: 'requestQueueOperationOptions parse',
        'ops/s': best(() => z.parse(schemas.requestQueueOperationOptions, { forefront: true })),
    },
]);
