/**
 * region-importer
 *
 * Reads one regional CSV export from the named key-value store `crm-exports`,
 * normalizes it, and appends the results to the named datasets
 * `crm-normalized` (valid) and `crm-quarantine` (rejected).
 *
 * Circuit breaker: if more than 5% of the region's rows have the wrong column
 * count, the run logs the rate and exits non-zero *without writing anything*,
 * unless it was started with `force: true`.
 *
 * Retries are made safe by a completion marker in the named key-value store
 * `crm-run-state`: writes happen in one batch at the end, and a re-run that
 * finds the marker exits successfully instead of appending the region twice.
 */

import { Actor, log } from 'apify';

import { importRegion } from './import.js';
import { CIRCUIT_BREAKER_MALFORMED_RATE } from './lib/crm-lib.js';

const EXPORTS_STORE = 'crm-exports';
const NORMALIZED_DATASET = 'crm-normalized';
const QUARANTINE_DATASET = 'crm-quarantine';
const RUN_STATE_STORE = 'crm-run-state';
const PUSH_CHUNK_SIZE = 500;

/** Push a large array to a dataset in bounded chunks. */
async function pushInChunks(dataset, items) {
    for (let offset = 0; offset < items.length; offset += PUSH_CHUNK_SIZE) {
        await dataset.pushData(items.slice(offset, offset + PUSH_CHUNK_SIZE));
    }
}

/**
 * The whole run, as a function so the early exits can simply return instead of
 * relying on `Actor.exit()` to tear the process down before the write path.
 *
 * @returns {Promise<number>} process exit code
 */
async function run() {
    const input = (await Actor.getInput()) ?? {};
    const region = Number(input.region);
    const force = input.force === true;

    if (!Number.isInteger(region) || region <= 0) {
        throw new Error(`Input "region" must be a positive integer, got ${JSON.stringify(input.region)}`);
    }

    const runState = await Actor.openKeyValueStore(RUN_STATE_STORE);
    const markerKey = `region-${region}`;
    const marker = await runState.getValue(markerKey);

    if (marker?.status === 'imported') {
        log.info(`Region ${region} was already imported by run ${marker.runId}; nothing to do.`);
        await Actor.setValue('OUTPUT', { ...marker, region, skipped: true });
        return 0;
    }

    const exportKey = `region-${region}.csv`;
    const exportsStore = await Actor.openKeyValueStore(EXPORTS_STORE);
    const csvText = await exportsStore.getValue(exportKey);

    if (typeof csvText !== 'string') {
        throw new Error(`Missing export "${exportKey}" in key-value store "${EXPORTS_STORE}". Run export-simulator first.`);
    }

    const result = importRegion(csvText, { region, force });
    const ratePercent = `${(result.malformedRate * 100).toFixed(2)}%`;

    log.info(`Parsed ${exportKey}`, {
        rows: result.totalRows,
        malformedRows: result.malformedRows,
        malformedRate: ratePercent,
        valid: result.contacts.length,
        quarantined: result.quarantined.length,
        force,
    });

    if (result.tripped) {
        log.error(
            `Circuit breaker tripped for region ${region}: malformed row rate ${ratePercent} exceeds `
            + `${(CIRCUIT_BREAKER_MALFORMED_RATE * 100).toFixed(0)}% `
            + `(${result.malformedRows}/${result.totalRows}). Nothing was written. `
            + 'Re-run with { "force": true } to import anyway.',
        );

        await Actor.setValue('OUTPUT', {
            region,
            force,
            circuitBreakerTripped: true,
            totalRows: result.totalRows,
            malformedRows: result.malformedRows,
            malformedRate: result.malformedRate,
            written: false,
        });

        return 1;
    }

    if (force && result.malformedRate > CIRCUIT_BREAKER_MALFORMED_RATE) {
        log.warning(`Importing region ${region} despite a malformed row rate of ${ratePercent} because force=true.`);
    }

    const normalized = await Actor.openDataset(NORMALIZED_DATASET);
    const quarantine = await Actor.openDataset(QUARANTINE_DATASET);

    await pushInChunks(normalized, result.contacts);
    await pushInChunks(quarantine, result.quarantined);

    const summary = {
        region,
        force,
        circuitBreakerTripped: false,
        totalRows: result.totalRows,
        malformedRows: result.malformedRows,
        malformedRate: result.malformedRate,
        imported: result.contacts.length,
        quarantined: result.quarantined.length,
        quarantinedByReason: result.quarantinedByReason,
        written: true,
    };

    // Written last: the marker means "this region is fully in the datasets", so
    // a restart that sees it can safely skip instead of appending twice.
    await runState.setValue(markerKey, { status: 'imported', runId: Actor.getEnv().actorRunId, ...summary });
    await Actor.setValue('OUTPUT', summary);

    log.info(`Region ${region} imported`, {
        imported: summary.imported,
        quarantined: summary.quarantined,
        byReason: summary.quarantinedByReason,
    });

    return 0;
}

await Actor.init();

const exitCode = await run();

await Actor.exit({
    exitCode,
    statusMessage: exitCode === 0 ? undefined : 'Circuit breaker tripped; nothing was written',
});
