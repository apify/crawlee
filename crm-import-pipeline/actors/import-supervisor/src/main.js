/**
 * import-supervisor
 *
 * Drives the whole nightly run using nothing but the Actor runs API and named
 * storages - there is no request queue anywhere in this pipeline:
 *
 *   1. reset the named storages this run owns, so a nightly re-run starts clean,
 *   2. run export-simulator and wait for it,
 *   3. run region-importer for every region, at most `maxConcurrency` at a
 *      time, polling run statuses; a FAILED region is restarted with
 *      force=true, up to `maxAttemptsPerRegion` attempts,
 *   4. once every region has SUCCEEDED, run reconciliation-reporter and wait,
 *   5. compare its OUTPUT against the simulator's expected-report.json field by
 *      field, and end the log with "RECONCILIATION PASS" or the exact diff.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import { Actor, log } from 'apify';

import { compareReports, runWithConcurrency } from './orchestrate.js';

const EXPORTS_STORE = 'crm-exports';
const EXPECTED_REPORT_KEY = 'expected-report.json';
const RESET_DATASETS = ['crm-normalized', 'crm-quarantine', 'crm-master'];
const RESET_KEY_VALUE_STORES = ['crm-run-state'];
const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
    seed = 'crm-nightly',
    regions = [1, 2, 3, 4, 5, 6, 7, 8],
    maxConcurrency = 4,
    maxAttemptsPerRegion = 3,
    pollIntervalSecs = 5,
    resetStorages = true,
    actorNamespace,
    exportSimulatorActorId,
    regionImporterActorId,
    reconciliationReporterActorId,
} = input;

const client = Actor.newClient();

/** Resolve `username/actor-name` for the three worker Actors. */
async function resolveActorIds() {
    const explicit = {
        simulator: exportSimulatorActorId,
        importer: regionImporterActorId,
        reporter: reconciliationReporterActorId,
    };

    if (explicit.simulator && explicit.importer && explicit.reporter) return explicit;

    let namespace = actorNamespace;

    if (!namespace) {
        const user = await client.user('me').get();
        namespace = user?.username;
    }

    if (!namespace) {
        throw new Error(
            'Could not resolve the Actor namespace. Provide "actorNamespace", or the three '
            + '*ActorId inputs explicitly.',
        );
    }

    return {
        simulator: explicit.simulator ?? `${namespace}/export-simulator`,
        importer: explicit.importer ?? `${namespace}/region-importer`,
        reporter: explicit.reporter ?? `${namespace}/reconciliation-reporter`,
    };
}

/** Poll a run until it reaches a terminal status. */
async function waitForRun(runId, label) {
    let lastStatus;

    for (;;) {
        const run = await client.run(runId).get();

        if (run.status !== lastStatus) {
            log.info(`${label}: ${run.status}`, { runId });
            lastStatus = run.status;
        }

        if (TERMINAL_STATUSES.has(run.status)) return run;
        await sleep(pollIntervalSecs * 1000);
    }
}

/** Delete the named storages this pipeline rebuilds on every run. */
async function resetNamedStorages() {
    for (const name of RESET_DATASETS) {
        const dataset = await Actor.openDataset(name);
        await dataset.drop();
        log.info(`Reset dataset "${name}"`);
    }

    for (const name of RESET_KEY_VALUE_STORES) {
        const store = await Actor.openKeyValueStore(name);
        await store.drop();
        log.info(`Reset key-value store "${name}"`);
    }
}

/**
 * Import one region, restarting it with force=true if it fails.
 *
 * @returns {Promise<{ region: number, retried: boolean, attempts: object[] }>}
 */
async function importRegion(actorId, region) {
    const attempts = [];
    let force = false;

    for (let attempt = 1; attempt <= maxAttemptsPerRegion; attempt++) {
        const label = `region ${region} attempt ${attempt}/${maxAttemptsPerRegion}${force ? ' (force)' : ''}`;
        log.info(`Starting ${label}`);

        const started = await Actor.start(actorId, { region, force });
        const run = await waitForRun(started.id, label);

        attempts.push({ attempt, runId: run.id, status: run.status, force });

        if (run.status === 'SUCCEEDED') {
            return { region, retried: attempt > 1, attempts };
        }

        // A FAILED importer means its circuit breaker tripped on the malformed
        // row rate, so the restart has to say force=true or it will trip again.
        if (run.status === 'FAILED') force = true;

        log.warning(`Region ${region} ended ${run.status} on attempt ${attempt}; restarting with force=${force}`, {
            runId: run.id,
        });
    }

    throw new Error(
        `Region ${region} did not succeed after ${maxAttemptsPerRegion} attempts: `
        + attempts.map((a) => `#${a.attempt} ${a.status}`).join(', '),
    );
}

const actorIds = await resolveActorIds();
log.info('Resolved worker Actors', actorIds);

if (resetStorages) await resetNamedStorages();

log.info('Step 1/4: export-simulator');
const simulatorRun = await Actor.call(actorIds.simulator, { seed });

if (simulatorRun.status !== 'SUCCEEDED') {
    throw new Error(`export-simulator ended ${simulatorRun.status} (run ${simulatorRun.id})`);
}

log.info(`Step 2/4: region-importer for ${regions.length} regions (max ${maxConcurrency} concurrent)`);
const importResults = await runWithConcurrency(regions, maxConcurrency, (region) => importRegion(actorIds.importer, region));

const regionsRetried = importResults.filter((result) => result.retried).map((result) => result.region).sort((a, b) => a - b);

log.info('All regions SUCCEEDED', {
    regions: importResults.map((result) => result.region),
    regionsRetried,
});

log.info('Step 3/4: reconciliation-reporter');
const reporterRun = await Actor.call(actorIds.reporter, { regionsRetried });

if (reporterRun.status !== 'SUCCEEDED') {
    throw new Error(`reconciliation-reporter ended ${reporterRun.status} (run ${reporterRun.id})`);
}

const reporterOutput = await client.keyValueStore(reporterRun.defaultKeyValueStoreId).getRecord('OUTPUT');
const actualReport = reporterOutput?.value;

if (!actualReport) {
    throw new Error(`reconciliation-reporter run ${reporterRun.id} produced no OUTPUT record`);
}

const exportsStore = await Actor.openKeyValueStore(EXPORTS_STORE);
const expectedReport = await exportsStore.getValue(EXPECTED_REPORT_KEY);

if (!expectedReport) {
    throw new Error(`Missing "${EXPECTED_REPORT_KEY}" in key-value store "${EXPORTS_STORE}"`);
}

log.info('Step 4/4: reconciliation');
log.info('Expected (export-simulator ground truth)', expectedReport);
log.info('Actual (reconciliation-reporter OUTPUT)', actualReport);

const { pass, diff } = compareReports(expectedReport, actualReport);

await Actor.setValue('OUTPUT', {
    seed,
    reconciliation: pass ? 'PASS' : 'FAIL',
    diff,
    regionsRetried,
    expected: expectedReport,
    actual: actualReport,
    runs: {
        simulator: simulatorRun.id,
        reporter: reporterRun.id,
        importers: importResults.flatMap((result) => result.attempts.map((a) => ({ region: result.region, ...a }))),
    },
});

if (pass) {
    log.info('RECONCILIATION PASS');
} else {
    log.error(['RECONCILIATION FAIL', ...diff].join('\n'));
}

await Actor.exit({ exitCode: pass ? 0 : 1 });
