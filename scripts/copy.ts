/* eslint-disable @typescript-eslint/no-var-requires,import/no-dynamic-require,global-require */
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const options = process.argv.slice(2).reduce((args, arg) => {
    const [key, value] = arg.split('=');
    args[key.substring(2)] = value ?? true;

    return args;
}, {} as any);

function copy(filename: string, from: string, to: string): void {
    copyFileSync(resolve(from, filename), resolve(to, filename));
}

function rewrite(path: string, replacer: (from: string) => string): void {
    try {
        const file = readFileSync(path).toString();
        const replaced = replacer(file);
        writeFileSync(path, replaced);
    } catch {
        // not found
    }
}

let rootVersion: string;

function getRootVersion(bump = true): string {
    if (rootVersion) {
        return rootVersion;
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires,import/no-dynamic-require,global-require
    rootVersion = require(resolve(root, './lerna.json')).version.replace(/^(\d+\.\d+\.\d+)-?.*$/, '$1');

    if (bump) {
        const parts = rootVersion.split('.');
        parts[2] = `${+parts[2] + 1}`;
        rootVersion = parts.join('.');
    }

    return rootVersion;
}

/**
 * Checks next dev version number based on the `crawlee` meta package via `npm show`.
 * We always use this package, so we ensure the version is the same for each package in the monorepo.
 */
function getNextVersion() {
    const versions: string[] = [];

    try {
        const versionString = execSync(`npm show @crawlee/core versions --json`, { encoding: 'utf8', stdio: 'pipe' });
        const parsed = JSON.parse(versionString) as string[];
        versions.push(...parsed);
    } catch {
        // the package might not have been published yet
    }

    const version = getRootVersion();

    if (versions.some((v) => v === version)) {
        // eslint-disable-next-line no-console
        console.error(`before-deploy: A release with version ${version} already exists. Please increment version accordingly.`);
        process.exit(1);
    }

    const preid = options.preid ?? 'alpha';
    const prereleaseNumbers = versions
        .filter((v) => v.startsWith(`${version}-${preid}.`))
        .map((v) => Number(v.match(/\.(\d+)$/)?.[1]));
    const lastPrereleaseNumber = Math.max(-1, ...prereleaseNumbers);

    return `${version}-${preid}.${lastPrereleaseNumber + 1}`;
}

// as we publish only the dist folder, we need to copy some meta files inside (readme/license/package.json)
// also changes paths inside the copied `package.json` (`dist/index.js` -> `index.js`)
const root = resolve(__dirname, '..');
const target = resolve(process.cwd(), 'dist');
const pkgPath = resolve(process.cwd(), 'package.json');

if (options.canary) {
    const pkgJson = require(pkgPath);
    const nextVersion = getNextVersion();
    pkgJson.version = nextVersion;

    for (const dep of Object.keys(pkgJson.dependencies)) {
        if (dep.startsWith('@crawlee/') || dep === 'crawlee') {
            const prefix = pkgJson.dependencies[dep].startsWith('^') ? '^' : '';
            pkgJson.dependencies[dep] = prefix + nextVersion;
        }
    }

    // eslint-disable-next-line no-console
    console.info(`canary: setting version to ${nextVersion}`);

    writeFileSync(pkgPath, `${JSON.stringify(pkgJson, null, 4)}\n`);
}

if (options['pin-versions']) {
    const pkgJson = require(pkgPath);
    const version = getRootVersion(false);

    for (const dep of Object.keys(pkgJson.dependencies ?? {})) {
        if (dep.startsWith('@crawlee/') || dep === 'crawlee') {
            pkgJson.dependencies[dep] = version;
        }
    }

    // eslint-disable-next-line no-console
    console.info(`pin-versions: version ${version}`, pkgJson.dependencies);

    writeFileSync(pkgPath, `${JSON.stringify(pkgJson, null, 4)}\n`);
}

copy('README.md', root, target);
copy('LICENSE.md', root, target);
copy('package.json', process.cwd(), target);
rewrite(resolve(target, 'package.json'), (pkg) => {
    return pkg.replace(/dist\//g, '').replace(/src\/(.*)\.ts/g, '$1.js');
});
rewrite(resolve(target, 'utils.js'), (pkg) => pkg.replace('../package.json', './package.json'));
