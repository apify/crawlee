/**
 * Pure import logic for one regional export - no platform I/O, so the whole
 * decision (including the circuit breaker) can be exercised offline by
 * `scripts/verify-pipeline.mjs`.
 */

import { CIRCUIT_BREAKER_MALFORMED_RATE, normalizeExport, summarizeQuarantine } from './lib/crm-lib.js';

/**
 * Parse and normalize a region's export, and decide whether the circuit
 * breaker trips.
 *
 * The breaker is evaluated *after* parsing but *before* any write, so a
 * tripped run leaves both datasets untouched and can be retried cleanly.
 *
 * @param {string} csvText
 * @param {{ region: number, force?: boolean }} options
 * @returns {{ region: number, force: boolean, tripped: boolean, totalRows: number,
 *             malformedRows: number, malformedRate: number, contacts: object[],
 *             quarantined: object[], quarantinedByReason: Record<string, number> }}
 */
export function importRegion(csvText, { region, force = false }) {
    const parsed = normalizeExport(csvText, region);
    const forced = force === true;
    const tripped = parsed.malformedRate > CIRCUIT_BREAKER_MALFORMED_RATE && !forced;

    return {
        region,
        force: forced,
        tripped,
        totalRows: parsed.totalRows,
        malformedRows: parsed.malformedRows,
        malformedRate: parsed.malformedRate,
        contacts: parsed.contacts,
        quarantined: parsed.quarantined,
        quarantinedByReason: summarizeQuarantine(parsed.quarantined),
    };
}
