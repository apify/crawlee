#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { createUpgradePrompt } from './upgrade.js';

const usage = `Usage: npx @crawlee/upgrade [options]

Prints an AI migration prompt, upgrading one Crawlee major at a time

Options:
  --from <major>  Starting major version; defaults to the project version
  --to <major>    Target major version; defaults to the newest bundled migration
  --export <dir>  Copy the migration guides into this directory and link the prompt to that copy
  -h, --help      Show help`;

const major = (value?: string) => (value === undefined ? undefined : Number(value));

try {
    const { values } = parseArgs({
        options: {
            from: { type: 'string' },
            to: { type: 'string' },
            export: { type: 'string' },
            help: { type: 'boolean', short: 'h' },
        },
    });
    const output = values.help
        ? usage
        : await createUpgradePrompt({ from: major(values.from), to: major(values.to), export: values.export });
    process.stdout.write(`${output}\n`);
} catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
}
