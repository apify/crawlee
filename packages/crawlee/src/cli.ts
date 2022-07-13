#!/usr/bin/env node

// eslint-disable-next-line
const importLocal = require('import-local');

if (!importLocal(__filename)) {
    // eslint-disable-next-line
    require('@crawlee/cli');
}
