// Measures wall-clock import time for a single specifier passed as argv[2].
// Uses dynamic import so the start time captures only the user's dep, not anything else.
import { performance } from 'node:perf_hooks';

const spec = process.argv[2];
if (!spec) {
    console.error('usage: node run-one.mjs <package>');
    process.exit(2);
}

const t0 = performance.now();
await import(spec);
const t1 = performance.now();
process.stdout.write((t1 - t0).toFixed(2));
