const { readdirSync, readFileSync, writeFileSync, realpathSync, statSync } = require('fs');
const path = require('path');

console.debugFixLog = false ? console.debug : () => {};
console.debugReadTypes = false ? console.debug : () => {};

console.log('Currect directory:', realpathSync('./'))
const typesPath = './types'
const paths = {
    'index.esm': path.join(typesPath, 'index.esm.d.ts'),
};

console.log('Processing', paths['index.esm']);

/**
 * Removes `namespace log` and adds appropriate import and reference to index.esm.d.ts.
 *
 * @param {string[]} input
 * @return {string[]}
 */
const fixLog = (input) => {
    const output = [];

    const modes = {
        base: 0, // Most reading and writing is in `base` mode: keep each line as is.
        'log-ns-replace': 1, // Erasing log namespace declaration and adding proper import
    };

    let index = 0
    let mode = modes.base;
    for (const line of input) {
        try {
            if (mode === modes.base) {
                if (index === 0) {
                    output.push('/// <reference path="../src/utils_log.d.ts" />');
                    console.debugFixLog('line #1', mode);
                }
                if (line.match(/^declare namespace log {/)) {
                    mode = modes['log-ns-replace'];
                    console.debugFixLog('switch to', mode, line);
                } else {
                    output.push(line);
                    console.debugFixLog('out', line);
                }
            } else if (mode === modes['log-ns-replace']) {
                if (line.match(/^\}/)) {
                    output.push("import * as log from 'apify-shared/log';");
                    mode = modes.base;
                    console.debugFixLog('switch to', mode, line);
                } else {
                    // nothing
                    console.debugFixLog('remove ', line);
                }
            }
        } finally {
            index++;
        }
    }
    return output;
};

/**
 * @callback FilenameFilter
 * @param {String} path Relative path to file considered.
 * @returns {Boolen} `true` is the path should be processed, `false` otherwise.
 */

/**
 * @callback FileHandler
 * @param {String} content File original content.
 * @returns {String} Content after transformation.
 */

/**
 * Traverses directory recursively, applies `filter()` on it's relative path path and if `true` is returned,
 * applies `handleFile()` on it's content overwriting the file with the returned value.
 * @param {String} dir Starting directory.
 * @param {FilenameFilter} filter Pathname filter function.
 * @param {FileHandler} handleFile File content transformation function.
 * @returns {Promise<string[]>} List of paths to processed files.
 */
const traverseDirs = async (dir, filter, handleFile) => {
    console.log('Reading directory', dir);
    const types = {};

    const dirContent = readdirSync(dir);
    dirContent.map(async (entry) => {
        const entryPath = path.join(dir, entry);
        const entryStat = statSync(entryPath);

        if (entryStat.isFile()) {
            if (filter(entry)) {
                types[entry.replace(/\.d\.ts$/, '')] = handleFile(entryPath);
            }
        } else if (entryStat.isDirectory()) {
            types[entry] = await traverseDirs(entryPath, filter, handleFile);
        }
    });
    return types;
};

const readTypes = (filepath) => {
    const input = readFileSync(filepath).toString();
    const inputByLine = input.split('\n');
    const types = [];
    for (const line of inputByLine) {
        const matches = line.match(/^export type (\S+)/);
        console.debugReadTypes(!!matches, line);
        if (matches) {
            types.push(matches[1]);
        }
    }
    return types;
};

const typeHierarchyToExports = (types, prefix = null, output = {}) => {
    for (const key of Object.keys(types)) {
        const entry = types[key];
        if (entry instanceof Array && entry.length > 0) {
            output[`${prefix}${key}`] = entry;
        } else if (entry instanceof Object) {
            typeHierarchyToExports(entry, `${prefix !== null ? prefix : ''}${key}/`, output);
        }
    }
    return output;
};

const fixTypes = (input, types = {}) => {
    const output = [...input];
    const outputCache = { };

    for (const line of output) {
        outputCache[line] = true;
    }

    const exports = typeHierarchyToExports(types, './');
    for (const file of Object.keys(exports)) {
        const exportedTypes = exports[file];
        const line = `export { ${exportedTypes.join(', ')} } from '${file}'`;
        if (outputCache[line] === undefined) {
            output.push(line);
            outputCache[line] = true;
        }
    }
    return output;
};


const processIndexEsm = async () => {
    const types = await traverseDirs(
        typesPath,
        (filename) => { return filename.endsWith('.d.ts'); },
        readTypes,
    );
    const input = readFileSync(paths['index.esm'])
        .toString()
        .split('\n');
    console.log('Fixing log module', paths['index.esm']);
    const fixedLog = fixLog(input);
    console.log('Fixing type exports', paths['index.esm']);
    const fixedTypes = fixTypes(fixedLog, types);
    console.log('Writing', paths['index.esm']);
    writeFileSync(paths['index.esm'], fixedTypes.join('\n'));
};

processIndexEsm().then();
