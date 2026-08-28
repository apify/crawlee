/**
 * export-simulator
 *
 * Generates 8 regional CRM exports from a seeded PRNG, writes them as CSV to
 * the named key-value store `crm-exports`, and - crucially - writes the ground
 * truth a correct pipeline must reproduce to `expected-report.json` in the
 * same store.
 *
 * The ground truth is not computed from the generator's internal bookkeeping.
 * It is computed by parsing the CSV bytes that were just written, using the
 * exact same `crm-lib` contract the importer and reporter use. So the expected
 * report describes the files as they actually exist, and any disagreement the
 * supervisor finds later is a real pipeline defect, not a modelling artefact.
 */

import { Actor, log } from 'apify';

import { generateExports } from './generate.js';
import { buildReport, normalizeExport } from './lib/crm-lib.js';

const EXPORTS_STORE = 'crm-exports';
const EXPECTED_REPORT_KEY = 'expected-report.json';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
    seed = 'crm-nightly',
    regionCount = 8,
    rowsPerRegion = 5000,
    duplicateRate = 0.1,
} = input;

log.info('Generating regional CRM exports', { seed, regionCount, rowsPerRegion, duplicateRate });

const generated = generateExports({ seed, regionCount, rowsPerRegion, duplicateRate });
const store = await Actor.openKeyValueStore(EXPORTS_STORE);

const contacts = [];
const quarantined = [];
const regions = [];

for (const file of generated.files) {
    await store.setValue(file.key, file.csv, { contentType: 'text/csv; charset=utf-8' });

    // Ground truth is derived from the bytes, via the shared contract.
    const parsed = normalizeExport(file.csv, file.region);
    contacts.push(...parsed.contacts);
    quarantined.push(...parsed.quarantined);

    regions.push({
        region: file.region,
        key: file.key,
        rows: parsed.totalRows,
        malformedRows: parsed.malformedRows,
        malformedRate: Number(parsed.malformedRate.toFixed(4)),
        valid: parsed.contacts.length,
        quarantined: parsed.quarantined.length,
    });

    log.info(`Wrote ${file.key}`, {
        rows: parsed.totalRows,
        malformed: `${(parsed.malformedRate * 100).toFixed(2)}%`,
        valid: parsed.contacts.length,
    });
}

const { master, ...expectedReport } = buildReport({ contacts, quarantined });

await store.setValue(EXPECTED_REPORT_KEY, expectedReport);

log.info('Expected report (ground truth)', expectedReport);
log.info(`Saved ${EXPECTED_REPORT_KEY} to key-value store "${EXPORTS_STORE}"`, { uniqueContacts: master.length });

await Actor.setValue('OUTPUT', { seed, exportsStore: EXPORTS_STORE, regions, expectedReport });

await Actor.exit();
