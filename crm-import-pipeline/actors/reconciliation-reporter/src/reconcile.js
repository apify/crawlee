/**
 * Pure reconciliation logic - no platform I/O, so it can be exercised offline.
 */

import { buildReport } from './lib/crm-lib.js';

/**
 * Deduplicate the normalized contacts and roll everything up into the report
 * the supervisor reconciles against the simulator's ground truth.
 *
 * @param {{ contacts: object[], quarantined: { reason: string }[], regionsRetried?: number[] }} input
 * @returns {{ report: object, master: object[] }}
 */
export function reconcile({ contacts, quarantined, regionsRetried = [] }) {
    const { master, ...report } = buildReport({ contacts, quarantined });

    return {
        // Field order matches the documented OUTPUT shape.
        report: { ...report, regionsRetried: [...regionsRetried].sort((a, b) => a - b) },
        master,
    };
}
