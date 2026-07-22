/* eslint-disable no-console */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

import { Extractor, ExtractorConfig, type IConfigFile } from '@microsoft/api-extractor';
import { globbySync } from 'globby';

/**
 * Generates (`--verify` to check) a per-package map of the public type-level interface of
 * each publishable `@crawlee/*` package, committed to `docs/public-api/<package>.api.md`.
 * These reports define where we promise backwards compatibility; changes must be reviewed.
 *
 * The build (`scripts/typescript_fixes.mjs`) injects `// @ts-ignore` comment lines into the
 * `.d.ts` files that crash API Extractor's AST walker, so we strip them for the duration of
 * the run and restore them afterwards. A few packages re-export such a member across a
 * package boundary and crash anyway; those are retried against a sanitized mirror of the
 * dist tree with `@crawlee/*` deps remapped via tsconfig `paths`, which dodges the bug.
 *
 * When running under GitHub Actions (or with `--github`), failures are additionally emitted
 * as workflow commands (`::error::`) so they show up as inline annotations in the CI run.
 */

const root = resolve(import.meta.dirname, '..', '..');
const baseConfigPath = resolve(import.meta.dirname, 'api-extractor.base.json');
const baseConfig = JSON.parse(readFileSync(baseConfigPath, 'utf8')) as IConfigFile;
const reportFolder = resolve(root, 'docs', 'public-api');
// API Extractor writes the "public" variant to a `.public.api.md` staging file here; we then
// promote it onto the committed `<name>.api.md` ourselves (see `extract`), so the committed
// filenames stay stable while the report content is @public-only (no @internal symbols).
const stagingFolder = resolve(reportFolder, 'temp');
const mirrorRoot = resolve(root, 'node_modules', '.cache', 'api-extractor-dts');
const verify = process.argv.includes('--verify');

// Emit GitHub Actions workflow commands (annotations) when running in CI, so out-of-date
// reports and crashes surface as inline warnings/errors. Opt in with `--github` or force
// off with `--no-github` (auto-detected via the runner-set GITHUB_ACTIONS env var otherwise).
const github = process.argv.includes('--github')
    || (process.env.GITHUB_ACTIONS === 'true' && !process.argv.includes('--no-github'));

// GitHub workflow commands must escape `%`, `\r` and `\n` in the message. See
// https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands
const ghEscape = (message: string) => message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const ghCommand = (kind: 'error' | 'warning', message: string) => {
    if (github) console.log(`::${kind}::${ghEscape(message)}`);
};

const TS_IGNORE_LINE = /^\s*\/\/ @ts-ignore optional peer dependency or compatibility with es2022\s*$/;
// CLI binary and project scaffolding are tooling, not an importable API where we promise BC.
const EXCLUDED = new Set(['@crawlee/cli', '@crawlee/templates']);

interface PackageManifest {
    name: string;
    private?: boolean;
    types?: string;
    exports?: Record<string, string | { types?: string }>;
}

const packageJsonPaths = globbySync('packages/*/package.json', { cwd: root, absolute: true }).sort();

function manifest(pkgJsonPath: string): PackageManifest {
    return JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as PackageManifest;
}

function dtsEntry(pkgDir: string, pkg: PackageManifest): string | undefined {
    const dot = pkg.exports?.['.'];
    const candidate = (typeof dot === 'object' ? dot.types : undefined) ?? pkg.types ?? './dist/index.d.ts';
    const full = resolve(pkgDir, candidate);
    return existsSync(full) ? full : undefined;
}

const stripTsIgnore = (content: string) =>
    content
        .split('\n')
        .filter((line) => !TS_IGNORE_LINE.test(line))
        .join('\n');

const reportBaseName = (name: string) => name.replace('@', '').replace('/', '-');
const reportFileName = (name: string) => `${reportBaseName(name)}.api.md`;
// With `reportVariants: ['public']`, API Extractor appends the variant kind to the file name,
// producing `<base>.public.api.md`. We stage that, then promote it to `<base>.api.md`.
const stagedFileName = (name: string) => `${reportBaseName(name)}.public.api.md`;

/** Lazily built sanitized mirror of the dist tree, with a `@crawlee/*` -> mirror paths map. */
let mirror: { packages: string; paths: Record<string, string[]> } | undefined;
function getMirror() {
    if (mirror) return mirror;
    rmSync(mirrorRoot, { recursive: true, force: true });
    for (const file of globbySync('packages/*/dist/**/*.d.ts', { cwd: root, absolute: true })) {
        const target = resolve(mirrorRoot, relative(root, file));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, stripTsIgnore(readFileSync(file, 'utf8')));
    }
    const packages = resolve(mirrorRoot, 'packages');
    const paths: Record<string, string[]> = {};
    for (const pkgJsonPath of packageJsonPaths) {
        const dir = resolve(packages, relative(resolve(root, 'packages'), dirname(pkgJsonPath)));
        if (existsSync(resolve(dir, 'dist/index.d.ts'))) paths[manifest(pkgJsonPath).name] = [resolve(dir, 'dist/index.d.ts')];
    }
    mirror = { packages, paths };
    return mirror;
}

function extract(pkgDir: string, pkgJsonPath: string, entry: string, paths?: Record<string, string[]>) {
    const name = manifest(pkgJsonPath).name;
    const config = ExtractorConfig.prepare({
        configObjectFullPath: baseConfigPath,
        packageJsonFullPath: pkgJsonPath,
        configObject: {
            ...baseConfig,
            projectFolder: pkgDir,
            mainEntryPointFilePath: entry,
            compiler: paths
                ? { overrideTsconfig: { compilerOptions: { baseUrl: root, paths } } }
                : baseConfig.compiler,
            apiReport: {
                enabled: true,
                // @public-only: drops @internal/@alpha/@beta symbols from the surface map.
                reportVariants: ['public'],
                reportFileName: reportFileName(name),
                // Stage into temp; we promote the `.public.api.md` output onto the committed
                // `<base>.api.md` ourselves so the tracked filenames don't change.
                reportFolder: stagingFolder,
                reportTempFolder: stagingFolder,
            },
        },
    });
    // Let API Extractor always write the staged report (localBuild), then diff it against the
    // committed report ourselves so `--verify` keys off the stable `<base>.api.md` name.
    Extractor.invoke(config, { localBuild: true, showVerboseMessages: false });

    const staged = readFileSync(resolve(stagingFolder, stagedFileName(name)), 'utf8');
    const committedPath = resolve(reportFolder, reportFileName(name));
    const committed = existsSync(committedPath) ? readFileSync(committedPath, 'utf8') : undefined;
    const apiReportChanged = staged !== committed;
    if (apiReportChanged && !verify) writeFileSync(committedPath, staged);
    return { apiReportChanged };
}

function main() {
    let failed = 0;

    // Report filenames owned by an in-scope package. Any committed `*.api.md` not in this set
    // is orphaned (e.g. its package was removed or renamed) and gets pruned in extract mode.
    // Keyed off package existence, not per-run success, so a transient build/extract failure
    // never deletes an otherwise-valid report.
    const expectedReports = new Set(
        packageJsonPaths
            .map(manifest)
            .filter((pkg) => !pkg.private && !EXCLUDED.has(pkg.name))
            .map((pkg) => reportFileName(pkg.name)),
    );

    // The build injects `// @ts-ignore` lines into the `.d.ts` files that crash API
    // Extractor's AST walker, so strip them for the duration of the run and restore after.
    const originals = new Map<string, string>();
    for (const file of globbySync('packages/*/dist/**/*.d.ts', { cwd: root, absolute: true })) {
        const content = readFileSync(file, 'utf8');
        if (content.includes('@ts-ignore optional peer dependency')) {
            originals.set(file, content);
            writeFileSync(file, stripTsIgnore(content));
        }
    }

    try {
        for (const pkgJsonPath of packageJsonPaths) {
            const pkg = manifest(pkgJsonPath);
            if (pkg.private || EXCLUDED.has(pkg.name)) continue;

            const pkgDir = dirname(pkgJsonPath);
            const entry = dtsEntry(pkgDir, pkg);
            if (!entry) {
                const message = `${pkg.name}: no built dist/index.d.ts — run "pnpm build" first`;
                console.error(`✗ ${message}`);
                ghCommand('error', message);
                failed++;
                continue;
            }

            // Up to date iff the committed report didn't change. Extractor warnings are
            // diagnostics, not BC-surface changes, so we key success on apiReportChanged.
            const ok = (result: { apiReportChanged: boolean }, via = '') => {
                if (verify && result.apiReportChanged) {
                    const message = `${pkg.name}: report out of date${via} — run "pnpm api:extract" and commit the changes in docs/public-api/`;
                    console.error(`✗ ${pkg.name}: report out of date${via}`);
                    ghCommand('error', message);
                    failed++;
                } else {
                    console.log(`✓ ${pkg.name}${via}`);
                }
            };

            try {
                ok(extract(pkgDir, pkgJsonPath, entry));
            } catch {
                // Fallback: retry against the sanitized mirror (dodges an API Extractor crash
                // on cross-package re-exports of comment-injected members, e.g. @crawlee/browser).
                try {
                    const { packages, paths } = getMirror();
                    const mirrorEntry = resolve(packages, relative(resolve(root, 'packages'), pkgDir), relative(pkgDir, entry));
                    const { [pkg.name]: _self, ...deps } = paths;
                    ok(extract(pkgDir, pkgJsonPath, mirrorEntry, deps), ' (via mirror)');
                } catch (err) {
                    const message = `${pkg.name}: api-extractor crashed: ${(err as Error).message}`;
                    console.error(`✗ ${message}`);
                    ghCommand('error', message);
                    failed++;
                }
            }
        }
    } finally {
        for (const [file, content] of originals) writeFileSync(file, content);
        rmSync(mirrorRoot, { recursive: true, force: true });
    }

    // Prune orphaned reports: committed `*.api.md` files with no owning in-scope package
    // (e.g. a removed/renamed package). Delete them in extract mode; flag them in verify mode.
    for (const file of globbySync('*.api.md', { cwd: reportFolder, absolute: true })) {
        if (expectedReports.has(basename(file))) continue;
        if (verify) {
            const message = `${basename(file)}: orphaned report (no matching package) — run "pnpm api:extract" to remove it`;
            console.error(`✗ ${message}`);
            ghCommand('error', message);
            failed++;
        } else {
            rmSync(file);
            console.log(`✓ removed orphaned report ${basename(file)}`);
        }
    }

    if (failed > 0) {
        if (verify) console.error('\nRun "pnpm api:extract" and commit the changes in docs/public-api/.');
        process.exit(1);
    }
}

main();
