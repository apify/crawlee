const { readdirSync, readFileSync, writeFileSync, mkdirSync, realpathSync, statSync } = require('fs');
const path = require('path');

const debug = (namespace, ...args) => {
    const debugTypefixes = process.env.DEBUG_TYPEFIXES;

    if (debugTypefixes && (debugTypefixes === '*' || debugTypefixes.includes(namespace))) {
        console.log(...args);
    }
};

console.log('Currect directory:', realpathSync('./'));
const typesPath = './types';
const paths = {
    main: path.join(typesPath, 'main.d.ts'),
    session_pool: path.join(typesPath, 'session_pool', 'session_pool.d.ts'),
    utils_log: path.join(typesPath, 'utils_log.d.ts'),
    playwright_utils: path.join(typesPath, 'playwright_utils.d.ts'),
};

console.log('Processing', paths.main);

const fixSessionPool = async () => {
    const input = readFileSync(paths.session_pool, { encoding: 'utf8' }).split('\n');

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
        if (!matchLines.some((s) => s.test(line))) {
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

const fixUtilsLog = async () => {
    const input = readFileSync(paths.utils_log, { encoding: 'utf8' }).split('\n');
    const output = [];
    let changed = false;

    for (const line of input) {
        if (!line.includes('import { LoggerOptions } from "@apify/log/log"')) {
            output.push(line);
        } else {
            changed = true;
            debug('fixUtilsLog', 'removing line', line);
        }
    }

    if (changed) {
        console.log('Writing file', paths.utils_log);
        writeFileSync(paths.utils_log, output.join('\n'), { encoding: 'utf8' });
    }
};

const addTypeReference = (input, types) => {
    return `${types.map((type) => `/// <reference path="${type}" />`).join('\n')}\n\n${input}`;
};

const padLeft = (input, length = 4) => {
    return input.split('\n').map((line) => `${' '.repeat(length)}${line}`).join('\n');
};

const makePathsAbsolute = (input, root) => {
    return input.split('\n').map((line) => {
        return line.replace(/\.\//, `${root}/`);
    }).join('\n');
};

const convertPlaywrightIndex = (input) => {
    const output = makePathsAbsolute(input, 'playwright');
    return addTypeReference(`declare module 'playwright' {\n${output}\n}`, ['./types/types.d.ts']);
};

const convertPlaywrightProtocol = (input) => {
    const output = padLeft(makePathsAbsolute(input, 'playwright/types'));
    return `declare module 'playwright/types/protocol' {\n${output}\n}`;
};

const convertPlaywrightStructs = (input) => {
    const output = padLeft(makePathsAbsolute(input, 'playwright/types'));
    return addTypeReference(`declare module 'playwright/types/structs' {\n${output}\n}`, ['./types.d.ts']);
};

const convertPlaywrightTypes = (input) => {
    const output = padLeft(makePathsAbsolute(input, 'playwright/types'));
    return addTypeReference(`declare module 'playwright/types/types' {\n${output}\n}`, ['./protocol.d.ts', './structs.d.ts']);
};

const inlinePlaywrightTypes = async () => {
    // copy files to `types/playwright`
    const files = [
        { path: 'index.d.ts', convertor: convertPlaywrightIndex },
        { path: 'types/protocol.d.ts', convertor: convertPlaywrightProtocol },
        { path: 'types/structs.d.ts', convertor: convertPlaywrightStructs },
        { path: 'types/types.d.ts', convertor: convertPlaywrightTypes },
    ];
    mkdirSync(path.join('types', 'playwright'));
    mkdirSync(path.join('types', 'playwright', 'types'));

    for (const file of files) {
        const fromPath = path.join('node_modules', 'playwright', file.path);
        const toPath = path.join('types', 'playwright', file.path);
        const input = readFileSync(fromPath, { encoding: 'utf8' });
        const output = file.convertor(input);
        console.log('Writing file', toPath);
        writeFileSync(toPath, output, { encoding: 'utf8' });
    }

    // add type references to playwright_utils.d.ts
    const input = readFileSync(paths.playwright_utils, { encoding: 'utf8' });
    const output = addTypeReference(input, [
        '../types/playwright/index.d.ts',
        '../types/playwright/types/types.d.ts',
    ]);
    console.log('Writing file', paths.playwright_utils);
    writeFileSync(paths.playwright_utils, output, { encoding: 'utf8' });
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

const EXCLUDED_CLASSES = ['Session', 'RequestList', 'Apify', 'Configuration', 'Configuration', 'BasicCrawler', 'LoggerOptions'];
const EXCLUDED_FROM_EXPORT = [new RegExp(`^(${EXCLUDED_CLASSES.join('|')})$`), /Local$/];

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
        const matches = line.match(/^export (?:type|class|interface) ([^<\s]+)/); // get exported types without generic Export<T>
        debug('readTypes', !!matches, line);
        if (matches && !EXCLUDED_FROM_EXPORT.some((s) => s.test(matches[1]))) {
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
    const input = readFileSync(paths.main, { encoding: 'utf8' })
        .split('\n');
    console.log('Fixing type exports', paths.main);
    const fixedTypes = fixTypes(input, types);
    console.log('Writing', paths.main);
    writeFileSync(paths.main, fixedTypes.join('\n'));
};

const fixTypesReferences = async () => {
    await traverseDirs(typesPath, (filename) => filename.endsWith('.d.ts'), (filepath) => {
        const input = readFileSync(filepath, { encoding: 'utf8' }).split('\n');
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
    });
};

(async () => {
    await processIndexEsm();
    await fixTypesReferences();
    await fixSessionPool();
    await fixUtilsLog();
    await inlinePlaywrightTypes();
})();
