const { readdirSync, readFileSync, writeFileSync, realpathSync, statSync } = require('fs');
const path = require('path');

const debug = (namespace, ...args) => {
    if (
        process.env.DEBUG_TYPEFIXES
        && (process.env.DEBUG_TYPEFIXES === '*' || process.env.DEBUG_TYPEFIXES.includes(namespace))
    ) {
        console.log(...args);
    }
};

console.log('Currect directory:', realpathSync('./'));
const typesPath = './types';
const paths = {
    main: path.join(typesPath, 'main.d.ts'),
    session_pool: path.join(typesPath, 'session_pool', 'session_pool.d.ts'),
};

console.log('Processing', paths['main']);

/**
 * Removes `namespace log` and adds appropriate import and reference to main.d.ts.
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

    let index = 0;
    let mode = modes.base;
    for (const line of input) {
        try {
            if (mode === modes.base) {
                // if (index === 0) {
                //     output.push('/// <reference path="../src/utils_log.d.ts" />');
                //     debug('fixLog', 'line #1', mode);
                // }
                if (line.match(/^declare namespace log {/)) {
                    mode = modes['log-ns-replace'];
                    debug('fixLog', 'switch to', mode, line);
                } else {
                    output.push(line);
                    debug('fixLog', 'out', line);
                }
            } else if (mode === modes['log-ns-replace']) {
                if (line.match(/^\}/)) {
                    mode = modes.base;
                    debug('fixLog', 'switch to', mode, line);
                } else {
                    // nothing
                    debug('fixLog', 'remove ', line);
                }
            }
        } finally {
            index++;
        }
    }
    return output;
};

const fixSessionPool = async () => {
    const input = readFileSync(paths.session_pool, { encoding: 'utf8' })
        .split('\n');

    const matchLines = [
        /addListener\(event/,
        /on\(event/,
        /once\(event/,
        /prependListener\(event/,
        /prependOnceListener\(event/,
        /removeListener\(event/,
        /off\(event/,
        /removeAllListeners\(event/,
        /setMaxListeners\(n/,
    ];
    const output = [];
    let changed = false;

    for (const line of input) {
        if (!matchLines.some(s => s.test(line))) {
            output.push(line);
        } else {
            changed = true;
            debug('fixSessionPool', 'removing line', line);
        }
    }

    if (changed) {
        console.log('Writing file', paths.session_pool);
        writeFileSync(paths.session_pool, output.join('\n'), { encoding: 'utf8' });
    }
};

/**
 * @callback FilenameFilter
 * @param {String} path Relative path to file considered.
 * @returns {Boolean} `true` is the path should be processed, `false` otherwise.
 */

/**
 * @callback FileHandler
 * @param {String} content Relative path to file.
 * @returns {{ [index: string]: object|array }} Content after transformation.
 */

/**
 * Traverses directory recursively, applies `filter()` on it's relative path path and if `true` is returned,
 * applies `handleFile()` on the file collecting the return values into a dictionary object.
 * @param {String} dir Starting directory.
 * @param {FilenameFilter} filter Pathname filter function.
 * @param {FileHandler} handleFile File processing function.
 * @returns {Promise<{ [index: string]: object|array }>} Hierarchical collection of `handleFile`'s return values.
 */
const traverseDirs = async (dir, filter, handleFile) => {
    console.log('Reading directory', dir);
    const types = {};

    const dirContent = readdirSync(dir);
    for (const entry of dirContent) {
        const entryPath = path.join(dir, entry);
        const entryStat = statSync(entryPath);

        if (entryStat.isFile()) {
            if (filter(entry)) {
                types[entry.replace(/\.d\.ts$/, '')] = handleFile(entryPath);
            }
        } else if (entryStat.isDirectory()) {
            types[entry] = await traverseDirs(entryPath, filter, handleFile);
        }
    }
    return types;
};

// const EXCLUDED_FROM_EXPORT = [/Session/, /RequestList/, /Local$/];

/**
 * Blindly extracts exported typenames from a `*.d.ts` file.
 * @param {string} filepath
 * @return {string[]}
 */
const readTypes = (filepath) => {
    const input = readFileSync(filepath, { encoding: 'utf8' });
    const inputByLine = input.split('\n');
    const types = [];
    for (const line of inputByLine) {
        const matches = line.match(/^export type ([^<\s]+)/); // get exported types without generic Export<T>
        debug('readTypes', !!matches, line);
        // && !EXCLUDED_FROM_EXPORT.some(s => s.test(matches[1]))
        if (matches) {
            types.push(matches[1]);
        }
    }
    return types;
};

/**
 * Flattens hierarchy of type exports into a mapping from relative paths to exported types.
 * @param {{ [index: string] : object|array }} types
 * @param {string} prefix
 * @param {{ [index: string]: string[] }} output
 * @return {{ [index: string]: string[] }} Dictionary mapping module declaration paths to exported types.
 */
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
    const outputCache = {};

    for (const line of output) {
        outputCache[line] = true;
    }

    const exports = typeHierarchyToExports(types, './');
    for (const file of Object.keys(exports)) {
        const exportedTypes = exports[file];
        const line = `export { ${exportedTypes.join(', ')} } from "${file}";`;
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
        (filename) => {
            return filename.endsWith('.d.ts');
        },
        readTypes,
    );
    const input = readFileSync(paths['main'], { encoding: 'utf8' })
        .split('\n');
    console.log('Fixing log module', paths['main']);
    // const fixedLog = fixLog(input);
    console.log('Fixing type exports', paths['main']);
    const fixedTypes = fixTypes(input, types);
    console.log('Writing', paths['main']);
    writeFileSync(paths['main'], fixedTypes.join('\n'));
};

const fixTypesReferences = async () => {
    await traverseDirs(
        typesPath,
        (filename) => {
            return filename.endsWith('.d.ts');
        },
        (filepath) => {
            const input = readFileSync(filepath, { encoding: 'utf8' })
                .split('\n');
            const output = [];
            let changed = false;
            let match;
            for (const line of input) {
                /* eslint-disable no-cond-assign */
                if (match = line.match(/\/\/\/\s*<reference\s*types="types-apify\/([^"]+)"\s*\/>/)) {
                    debug('fixTypesReferences', 'fixing types-apify from file', filepath);
                    output.push(`/// <reference path="../types-apify/${match[1]}.d.ts" />`);
                    changed = true;
                } else if (match = line.match(/^([^"]+)"node\/([^$]+)/)) {
                    debug('fixTypesReferences', 'fixing "node/" from file', filepath);
                    output.push(`${match[1]} "${match[2]}`);
                    changed = true;
                } else {
                    output.push(line);
                }
                /* eslint-enable no-cond-assign */
            }

            if (changed === true) {
                console.log('Writing', filepath);
                writeFileSync(filepath, output.join('\n'));
            }
        },
    );
};

(async () => {
    await processIndexEsm();
    await fixTypesReferences();
    await fixSessionPool();
})();
