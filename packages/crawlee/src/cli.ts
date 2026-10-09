#!/usr/bin/env node

import importLocal from 'import-local';

const isUpgrade = process.argv.slice(2).find((arg) => !arg.startsWith('-')) === 'upgrade';

// Use the invoked version when upgrading a project with an older local CLI.
// @ts-ignore bad types most likely?
if (isUpgrade || !importLocal(import.meta.url)) {
    await import('@crawlee/cli');
}
