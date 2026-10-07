#!/usr/bin/env node

import importLocal from 'import-local';

const isUpgradeToV4 = process.argv.slice(2).find((arg) => !arg.startsWith('-')) === 'upgrade-to-v4';

// Use the invoked version when upgrading a project with an older local CLI.
// @ts-ignore bad types most likely?
if (isUpgradeToV4 || !importLocal(import.meta.url)) {
    await import('@crawlee/cli');
}
