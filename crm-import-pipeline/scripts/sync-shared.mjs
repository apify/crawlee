#!/usr/bin/env node
/**
 * Copy `shared/crm-lib.js` into every Actor that needs it.
 *
 * Actors are deployed independently, so they cannot import a workspace
 * package - each one ships its own copy. Run this after editing the shared
 * library; run it with `--check` in CI to fail if a copy has drifted.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'shared', 'crm-lib.js');

const TARGET_ACTORS = ['export-simulator', 'region-importer', 'import-supervisor', 'reconciliation-reporter'];

const checkOnly = process.argv.includes('--check');
const expected = readFileSync(source, 'utf8');
const drifted = [];

for (const actor of TARGET_ACTORS) {
    const target = join(root, 'actors', actor, 'src', 'lib', 'crm-lib.js');
    let current = null;

    try {
        current = readFileSync(target, 'utf8');
    } catch {
        current = null;
    }

    if (current === expected) continue;

    if (checkOnly) {
        drifted.push(relative(root, target));
        continue;
    }

    writeFileSync(target, expected);
    console.log(`updated ${relative(root, target)}`);
}

if (drifted.length > 0) {
    console.error('These copies of shared/crm-lib.js are out of date:');
    for (const path of drifted) console.error(`  ${path}`);
    console.error('Run: node scripts/sync-shared.mjs');
    process.exit(1);
}

console.log(checkOnly ? 'All crm-lib.js copies are in sync.' : 'Done.');
