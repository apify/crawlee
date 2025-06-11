#!/usr/bin/env node

import importLocal from 'import-local';

// @ts-ignore bad types most likely?
if (!importLocal(import.meta.url)) {
    // eslint-disable-next-line
    require('@crawlee/cli');
}
