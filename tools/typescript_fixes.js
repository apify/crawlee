const { readFileSync, writeFileSync, realpathSync } = require('fs');
const path = require('path');

console.debug = () => {};

console.log('Currect directory:', realpathSync('./'))
const typesPath = './types'
const paths = {
    'index.esm': path.join(typesPath, 'index.esm.d.ts'),
};

const input = readFileSync(paths['index.esm']).toString();

const inputByLine = input.split('\n');
const output = [];

const modes = {
    base: 0, // Most reading and writing is in `base` mode: keep each line as is.
    'log-ns-replace': 1, // Erasing log namespace declaration and adding proper import
};

console.log('Processing', paths['index.esm']);

let index = 0
let mode = modes.base;
for (const line of inputByLine) {
    try {
        if (mode === modes.base) {
            if (index === 0) {
                output.push('/// <reference path="../src/utils_log.d.ts" />');
                console.debug('line #1', mode);
            }
            if (line.match(/^declare namespace log {/)) {
                mode = modes['log-ns-replace'];
                console.debug('switch to', mode, line);
            } else {
                output.push(line);
                console.debug('out', line);
            }
        } else if (mode === modes['log-ns-replace']) {
            if (line.match(/^\}/)) {
                output.push("import * as log from 'apify-shared/log';");
                mode = modes.base;
                console.debug('switch to', mode, line);
            } else {
                // nothing
                console.debug('remove ', line);
            }
        }
    } finally {
        index++;
    }
}

console.log('Writing', paths['index.esm']);
writeFileSync(paths['index.esm'], output.join('\n'));
