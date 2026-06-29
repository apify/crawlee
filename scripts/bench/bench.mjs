// Spawns a fresh `node` process per sample to measure cold import time of a
// list of specifiers. Reports median/min/max so warm-up effects are visible.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(here, 'run-one.mjs');

const SAMPLES = Number(process.env.SAMPLES ?? 7);
const WARMUP = Number(process.env.WARMUP ?? 1);

const targets = process.argv.slice(2);
if (targets.length === 0) {
    targets.push(
        'crawlee',
        '@crawlee/basic',
        '@crawlee/cheerio',
        '@crawlee/http',
        '@crawlee/playwright',
        '@crawlee/puppeteer',
        '@crawlee/core',
        '@crawlee/utils',
    );
}

function measureOnce(spec) {
    const r = spawnSync(process.execPath, [runner, spec], {
        cwd: here,
        env: { ...process.env, NODE_PATH: '/home/user/crawlee/node_modules' },
        encoding: 'utf8',
    });
    if (r.status !== 0) {
        process.stderr.write(`\n${spec}: FAILED\n${r.stderr}\n`);
        return null;
    }
    return Number(r.stdout.trim());
}

console.log(`# ${SAMPLES} samples (after ${WARMUP} warm-up)`);
console.log('package'.padEnd(28), 'median', '  min', '  max', '  all');
for (const spec of targets) {
    for (let i = 0; i < WARMUP; i++) measureOnce(spec);
    const samples = [];
    for (let i = 0; i < SAMPLES; i++) {
        const v = measureOnce(spec);
        if (v != null) samples.push(v);
    }
    if (samples.length === 0) continue;
    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    console.log(
        spec.padEnd(28),
        median.toFixed(1).padStart(6),
        min.toFixed(1).padStart(6),
        max.toFixed(1).padStart(6),
        ' ',
        samples.map((s) => s.toFixed(1)).join(' '),
    );
}
