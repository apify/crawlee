/**
 * reconciliation-reporter
 *
 * Reads the named dataset `crm-normalized`, deduplicates contacts by
 * normalized email (keeping the latest `updatedAt`), writes the survivors to
 * the named dataset `crm-master`, and writes the run's reconciliation report
 * to OUTPUT in its own default key-value store.
 *
 * `regionsRetried` is not something this Actor can observe - only the
 * supervisor knows which regions had to be restarted - so it arrives as input
 * and is passed straight through into the report.
 */

import { Actor, log } from 'apify';

import { reconcile } from './reconcile.js';
import { summarizeQuarantine } from './lib/crm-lib.js';

const NORMALIZED_DATASET = 'crm-normalized';
const QUARANTINE_DATASET = 'crm-quarantine';
const MASTER_DATASET = 'crm-master';
const READ_PAGE_SIZE = 5000;
const PUSH_CHUNK_SIZE = 500;

/** Read every item of a dataset, page by page. */
async function readAllItems(dataset) {
    const items = [];

    for (let offset = 0; ; offset += READ_PAGE_SIZE) {
        const page = await dataset.getData({ offset, limit: READ_PAGE_SIZE });
        items.push(...page.items);
        if (page.items.length < READ_PAGE_SIZE) break;
    }

    return items;
}

async function pushInChunks(dataset, items) {
    for (let offset = 0; offset < items.length; offset += PUSH_CHUNK_SIZE) {
        await dataset.pushData(items.slice(offset, offset + PUSH_CHUNK_SIZE));
    }
}

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const regionsRetried = Array.isArray(input.regionsRetried) ? input.regionsRetried.map(Number) : [];

const normalized = await Actor.openDataset(NORMALIZED_DATASET);
const quarantine = await Actor.openDataset(QUARANTINE_DATASET);

const contacts = await readAllItems(normalized);
const quarantined = await readAllItems(quarantine);

log.info('Loaded pipeline output', { normalized: contacts.length, quarantined: quarantined.length });
log.info('Quarantine breakdown', summarizeQuarantine(quarantined));

const { report, master } = reconcile({ contacts, quarantined, regionsRetried });

// Rebuild the master dataset from scratch: it is a materialized view of
// `crm-normalized`, so appending to a previous night's contents would be wrong.
const staleMaster = await Actor.openDataset(MASTER_DATASET);
await staleMaster.drop();

const masterDataset = await Actor.openDataset(MASTER_DATASET);
await pushInChunks(masterDataset, master);

log.info(`Wrote ${master.length} deduplicated contacts to dataset "${MASTER_DATASET}"`);

await Actor.setValue('OUTPUT', report);
log.info('Reconciliation report', report);

await Actor.exit();
