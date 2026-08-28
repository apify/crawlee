/**
 * Pure orchestration helpers - the concurrency pool and the report comparison.
 * Kept free of platform I/O so both can be tested offline.
 */

import { RECONCILED_FIELDS } from './lib/crm-lib.js';

/**
 * Run `worker` over `items` with at most `concurrency` in flight, preserving
 * input order in the results.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
export async function runWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let next = 0;

    const runner = async () => {
        for (;;) {
            const index = next++;
            if (index >= items.length) return;
            results[index] = await worker(items[index], index);
        }
    };

    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, runner));
    return results;
}

/** Render a value for a diff line. */
function format(value) {
    return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

/**
 * Compare the reporter's OUTPUT against the simulator's ground truth, field by
 * field. `quarantinedByReason` is compared per reason rather than as a blob so
 * the diff points at the reason that actually drifted.
 *
 * @param {object} expected
 * @param {object} actual
 * @returns {{ pass: boolean, diff: string[] }}
 */
export function compareReports(expected, actual) {
    const diff = [];
    const left = expected ?? {};
    const right = actual ?? {};

    for (const field of RECONCILED_FIELDS) {
        if (field === 'quarantinedByReason') {
            const reasons = [...new Set([...Object.keys(left[field] ?? {}), ...Object.keys(right[field] ?? {})])].sort();

            for (const reason of reasons) {
                const expectedCount = left[field]?.[reason] ?? 0;
                const actualCount = right[field]?.[reason] ?? 0;
                if (expectedCount !== actualCount) {
                    diff.push(`quarantinedByReason.${reason}: expected ${expectedCount}, actual ${actualCount}`);
                }
            }

            continue;
        }

        if (left[field] !== right[field]) {
            diff.push(`${field}: expected ${format(left[field])}, actual ${format(right[field])}`);
        }
    }

    return { pass: diff.length === 0, diff };
}
