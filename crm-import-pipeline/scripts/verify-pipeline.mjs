#!/usr/bin/env node
/**
 * Offline end-to-end verification of the pipeline's logic.
 *
 * The Apify platform is not available here, so this harness stands in for it:
 * in-memory named datasets and key-value stores, and a supervisor loop that
 * makes the same decisions the real one does (circuit breaker -> FAILED ->
 * restart with force=true).
 *
 * What it is actually checking is that the four Actors agree with each other:
 * each stage below is imported from that Actor's own source tree, including
 * its own copy of `crm-lib.js`. If the simulator's ground truth and the
 * importer's behaviour ever drift apart, the reconciliation here fails.
 *
 *   node scripts/verify-pipeline.mjs [--seed <seed>] [--rows <n>]
 */

import { generateExports } from '../actors/export-simulator/src/generate.js';
import { buildReport, normalizeExport } from '../actors/export-simulator/src/lib/crm-lib.js';
import { importRegion } from '../actors/region-importer/src/import.js';
import { reconcile } from '../actors/reconciliation-reporter/src/reconcile.js';
import { compareReports, runWithConcurrency } from '../actors/import-supervisor/src/orchestrate.js';

const CIRCUIT_BREAKER_RATE = 0.05;
const HOT_REGION = 7;
const MAX_ATTEMPTS = 3;

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
    checks++;
    if (condition) {
        console.log(`  ok   ${label}`);
        return;
    }
    failures++;
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${detail}`}`);
}

function equal(label, actual, expected) {
    check(label, Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** Stand-in for export-simulator's main.js. */
function runSimulator(options) {
    const generated = generateExports(options);
    const exportsStore = new Map();
    const contacts = [];
    const quarantined = [];

    for (const file of generated.files) {
        exportsStore.set(file.key, file.csv);
        const parsed = normalizeExport(file.csv, file.region);
        contacts.push(...parsed.contacts);
        quarantined.push(...parsed.quarantined);
    }

    const { master, ...expectedReport } = buildReport({ contacts, quarantined });
    exportsStore.set('expected-report.json', expectedReport);

    return { generated, exportsStore, expectedReport };
}

/**
 * Stand-in for import-supervisor's importer stage: runs every region through
 * the real `importRegion`, retrying a tripped region with force=true.
 */
async function runImporters(exportsStore, regions, { maxConcurrency = 4 } = {}) {
    const datasets = { 'crm-normalized': [], 'crm-quarantine': [] };
    const attemptsByRegion = new Map();
    const retried = [];

    await runWithConcurrency(regions, maxConcurrency, async (region) => {
        const csv = exportsStore.get(`region-${region}.csv`);
        let force = false;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            const result = importRegion(csv, { region, force });

            if (result.tripped) {
                // A tripped run exits non-zero having written nothing.
                attemptsByRegion.set(region, attempt);
                force = true;
                continue;
            }

            datasets['crm-normalized'].push(...result.contacts);
            datasets['crm-quarantine'].push(...result.quarantined);
            attemptsByRegion.set(region, attempt);
            if (attempt > 1) retried.push(region);
            return;
        }

        throw new Error(`region ${region} never succeeded`);
    });

    return { datasets, attemptsByRegion, regionsRetried: retried.sort((a, b) => a - b) };
}

function parseArgs(argv) {
    const args = { seed: 'nightly-2026-08-28', rows: 5000 };
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--seed') args.seed = argv[++i];
        else if (argv[i] === '--rows') args.rows = Number(argv[++i]);
    }
    return args;
}

const { seed, rows } = parseArgs(process.argv);
const regions = [1, 2, 3, 4, 5, 6, 7, 8];

console.log(`CRM import pipeline verification (seed="${seed}", rowsPerRegion=${rows})\n`);

// ---------------------------------------------------------------- generation
console.log('export-simulator');
const { generated, exportsStore, expectedReport } = runSimulator({ seed, rowsPerRegion: rows });

equal('generates 8 regional exports', generated.files.length, 8);
check('every export has the expected row count', generated.files.every((f) => f.rowCount === rows));
check('every export is stored under region-<n>.csv', regions.every((r) => exportsStore.has(`region-${r}.csv`)));
equal('cross-region duplicate rows are 10% of all rows', generated.duplicateRows, Math.round(rows * 0.1) * 8);
check('expected-report.json is stored alongside the exports', exportsStore.has('expected-report.json'));

const rates = new Map(generated.files.map((f) => [f.region, normalizeExport(f.csv, f.region).malformedRate]));
check(
    `region ${HOT_REGION} malformed rate is 6-8%`,
    rates.get(HOT_REGION) >= 0.06 && rates.get(HOT_REGION) <= 0.08,
    `${(rates.get(HOT_REGION) * 100).toFixed(2)}%`,
);
check(
    'every other region is under 5%',
    regions.filter((r) => r !== HOT_REGION).every((r) => rates.get(r) < CIRCUIT_BREAKER_RATE),
    [...rates].map(([r, v]) => `r${r}=${(v * 100).toFixed(2)}%`).join(' '),
);
check(
    'all five quarantine reasons occur',
    Object.values(expectedReport.quarantinedByReason).every((count) => count > 0),
    JSON.stringify(expectedReport.quarantinedByReason),
);

// ----------------------------------------------------------------- importing
console.log('\nregion-importer + import-supervisor');
const { datasets, attemptsByRegion, regionsRetried } = await runImporters(exportsStore, regions);

equal('only the hot region needed a retry', regionsRetried, [HOT_REGION]);
equal(`region ${HOT_REGION} took two attempts`, attemptsByRegion.get(HOT_REGION), 2);
check('every other region succeeded first try', regions.filter((r) => r !== HOT_REGION).every((r) => attemptsByRegion.get(r) === 1));

const trippedRun = importRegion(exportsStore.get(`region-${HOT_REGION}.csv`), { region: HOT_REGION, force: false });
check('a tripped run yields no contacts to write', trippedRun.tripped === true);
const forcedRun = importRegion(exportsStore.get(`region-${HOT_REGION}.csv`), { region: HOT_REGION, force: true });
check('the forced re-run imports the same region', forcedRun.tripped === false && forcedRun.contacts.length > 0);
equal(
    'no rows are lost or duplicated across the two datasets',
    datasets['crm-normalized'].length + datasets['crm-quarantine'].length,
    rows * 8,
);

// -------------------------------------------------------------- reconciling
console.log('\nreconciliation-reporter');
const { report, master } = reconcile({
    contacts: datasets['crm-normalized'],
    quarantined: datasets['crm-quarantine'],
    regionsRetried,
});

equal('crm-master size matches uniqueContacts', master.length, report.uniqueContacts);
equal('duplicatesMerged accounts for every merged row', report.imported - report.uniqueContacts, report.duplicatesMerged);
check('crm-master is sorted by email', master.every((row, i) => i === 0 || master[i - 1].email < row.email));
equal('crm-master has no duplicate emails', new Set(master.map((c) => c.email)).size, master.length);
equal('regionsRetried is carried into the report', report.regionsRetried, [HOT_REGION]);

const latestByEmail = new Map();
for (const contact of datasets['crm-normalized']) {
    const seen = latestByEmail.get(contact.email);
    if (seen === undefined || contact.updatedAt > seen) latestByEmail.set(contact.email, contact.updatedAt);
}
check(
    'every surviving contact is the latest version of that email',
    master.every((contact) => contact.updatedAt === latestByEmail.get(contact.email)),
);

// ------------------------------------------------------------- reconciliation
console.log('\nimport-supervisor reconciliation');
const { pass, diff } = compareReports(expectedReport, report);
check('RECONCILIATION PASS', pass, diff.join(' | '));

const broken = { ...report, uniqueContacts: report.uniqueContacts - 1, quarantinedByReason: { ...report.quarantinedByReason, 'invalid-phone': 0 } };
const brokenResult = compareReports(expectedReport, broken);
equal('a drifted report produces an exact diff', brokenResult.diff, [
    `quarantinedByReason.invalid-phone: expected ${expectedReport.quarantinedByReason['invalid-phone']}, actual 0`,
    `uniqueContacts: expected ${expectedReport.uniqueContacts}, actual ${expectedReport.uniqueContacts - 1}`,
]);

// ------------------------------------------------------- ordering + determinism
console.log('\ndeterminism and order independence');
const rerun = runSimulator({ seed, rowsPerRegion: rows });
check('the same seed reproduces byte-identical exports', generated.files.every((f, i) => f.csv === rerun.generated.files[i].csv));
const other = runSimulator({ seed: `${seed}-x`, rowsPerRegion: rows });
check('a different seed produces different exports', generated.files[0].csv !== other.generated.files[0].csv);

const shuffled = [...regions].reverse();
const second = await runImporters(exportsStore, shuffled, { maxConcurrency: 3 });
const secondReport = reconcile({
    contacts: second.datasets['crm-normalized'],
    quarantined: second.datasets['crm-quarantine'],
    regionsRetried: second.regionsRetried,
});
equal('dedup is independent of the order regions finish in', secondReport.report, report);
check('crm-master is identical under a different region order', JSON.stringify(secondReport.master) === JSON.stringify(master));

// ------------------------------------------------------------ multi-seed bands
console.log('\ndefect rate bands across seeds');
for (const trialSeed of ['alpha', 'beta', 'gamma', '42', 'nightly-2026-01-01']) {
    const trial = generateExports({ seed: trialSeed, rowsPerRegion: rows });
    const trialRates = trial.files.map((f) => normalizeExport(f.csv, f.region).malformedRate);
    const hot = trialRates[HOT_REGION - 1];
    const rest = trialRates.filter((_, i) => i !== HOT_REGION - 1);
    check(
        `seed "${trialSeed}": r7=${(hot * 100).toFixed(2)}% in 6-8%, others max ${(Math.max(...rest) * 100).toFixed(2)}% under 5%`,
        hot >= 0.06 && hot <= 0.08 && Math.max(...rest) < CIRCUIT_BREAKER_RATE,
    );
}

console.log(`\nExpected report:\n${JSON.stringify(expectedReport, null, 2)}`);
console.log(`\n${checks - failures}/${checks} checks passed.`);

if (failures > 0) {
    console.error(`${failures} check(s) FAILED`);
    process.exit(1);
}

console.log('RECONCILIATION PASS');
