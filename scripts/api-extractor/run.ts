/* eslint-disable no-console */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

import { Extractor, ExtractorConfig, type IConfigFile } from '@microsoft/api-extractor';
import { globbySync } from 'globby';
import ts from 'typescript';

/**
 * Generates (`--verify` to check) a per-package map of the public type-level interface of
 * each publishable `@crawlee/*` package, committed to `docs/public-api/<package>.api.md`.
 * These reports define where we promise backwards compatibility; changes must be reviewed.
 *
 * Before extraction we sanitize the `.d.ts` files (for the duration of the run, restoring them
 * afterwards): (1) the build (`scripts/typescript_fixes.mjs`) injects `// @ts-ignore` comment
 * lines that crash API Extractor's AST walker, so we strip them; (2) we rewrite the legacy
 * JSDoc `@ignore` tag to `@internal`, since API Extractor only trims by release tag and would
 * otherwise leak `@ignore`-d members into the `public` report. Rewriting `@ignore` also trims
 * the members that were crashing API Extractor's AST walker (e.g. `BrowserLauncher`'s inline
 * `import("ow")` `optionsShape`), so the affected packages now extract cleanly on the primary
 * pass. A few packages may still re-export a comment-injected member across a package boundary
 * and crash anyway; those are retried against a sanitized mirror of the dist tree with
 * `@crawlee/*` deps remapped via tsconfig `paths`.
 *
 * After extraction we prune import lines that nothing in the report references — API
 * Extractor snapshots the imports before it trims the non-`@public` declarations, so
 * `@internal`-only types would otherwise linger there (see `pruneUnusedImports`).
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
// `@ignore` is a legacy JSDoc/TypeDoc tag that API Extractor does not act on — unlike the
// release tags (`@internal`/`@alpha`/`@beta`), it does NOT trim the member from the report,
// so `@ignore`-d symbols wrongly leak into the `public` variant. There is no config knob for
// this, so we rewrite the tag to `@internal` in the (transient) `.d.ts`, letting API
// Extractor's real release-tag trimming drop them from the public surface map. We only rewrite
// `@ignore` when it sits directly behind a JSDoc gutter (`/**` or a leading `*`), which covers
// both the single-line `/** @ignore */` and multi-line ` * @ignore` forms while leaving prose
// or string literals that merely mention "@ignore" untouched.
const IGNORE_TAG = /(\/\*\*|\*)(\s*)@ignore\b/g;
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

const sanitizeDts = (content: string) =>
    content
        .split('\n')
        .filter((line) => !TS_IGNORE_LINE.test(line))
        .join('\n')
        .replace(IGNORE_TAG, '$1$2@internal');

type ImportStatement = ts.ImportDeclaration | ts.ImportEqualsDeclaration;
const isImport = (node: ts.Node): node is ImportStatement =>
    ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node);

/** Local binding names introduced by an import statement (`[]` for a side-effect import). */
function importBindings(node: ImportStatement): string[] {
    if (ts.isImportEqualsDeclaration(node)) return [node.name.text];
    const clause = node.importClause;
    if (!clause) return [];
    const names = clause.name ? [clause.name.text] : [];
    const bound = clause.namedBindings;
    if (bound && ts.isNamespaceImport(bound)) names.push(bound.name.text);
    if (bound && ts.isNamedImports(bound)) names.push(...bound.elements.map((element) => element.name.text));
    return names;
}

/**
 * Drops import statements whose binding is never referenced in the rest of the report.
 *
 * API Extractor collects the import list from the entry point *before* it trims the
 * non-`@public` declarations, and never revisits it — deliberately, since a rollup may
 * legitimately need an import that its release-tag filter would have dropped. In the API
 * report, though, a type reachable only from an `@internal` member survives as a bare
 * import and reads as public surface (e.g. `Cookie` from `tough-cookie` in `@crawlee/core`),
 * producing review noise on changes that never touched the public API. There is no config
 * knob for this, so we post-process the report.
 *
 * The report body is ordinary TypeScript, so we parse it rather than pattern-match lines:
 * bindings come from real import nodes (covering every shape the emitter produces, including
 * `import X = require(...)`), and usages from real identifier tokens — so a name occurring
 * only in a string literal or a `// Warning:` comment correctly does not count as a use.
 */
function pruneUnusedImports(report: string): string {
    const lines = report.split('\n');
    // The report is a fixed markdown skeleton wrapping a single ```ts fence.
    const open = lines.indexOf('```ts');
    const close = lines.lastIndexOf('```');
    if (open === -1 || close <= open) return report;

    const source = ts.createSourceFile(
        'report.ts',
        lines.slice(open + 1, close).join('\n'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    // `parseDiagnostics` is internal, but there is no public per-file equivalent that doesn't
    // require a whole Program. A report that doesn't parse means our assumptions are broken,
    // so leave the imports alone rather than guess which ones are dead.
    const diagnostics = (source as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics;
    if (diagnostics?.length) {
        const message = `skipped pruning unused imports: report did not parse (${diagnostics.length} syntax errors)`;
        console.warn(`! ${message}`);
        ghCommand('warning', message);
        return report;
    }

    const imports = source.statements.filter(isImport);
    if (imports.length === 0) return report;

    const used = new Set<string>();
    const collect = (node: ts.Node) => {
        // Skip the import statements themselves so a binding never counts as its own usage.
        if (isImport(node)) return;
        if (ts.isIdentifier(node)) used.add(node.text);
        node.forEachChild(collect);
    };
    source.forEachChild(collect);

    // Offset back into the surrounding markdown; `getStart` skips leading trivia so we never
    // swallow a comment sitting above an import.
    const lineOf = (position: number) => open + 1 + source.getLineAndCharacterOfPosition(position).line;
    const unused = imports.filter((node) => {
        const bindings = importBindings(node);
        return bindings.length > 0 && bindings.every((binding) => !used.has(binding));
    });
    if (unused.length === 0) return report;

    const dropped = new Set<number>();
    for (const node of unused) {
        for (let line = lineOf(node.getStart(source)); line <= lineOf(node.getEnd()); line++) dropped.add(line);
    }
    // Emptying the block entirely would leave the blank line that separated it from the
    // declarations stacked on the one after the ```ts fence; drop it so the output matches
    // what API Extractor emits for an import-less report.
    const after = lineOf(unused[unused.length - 1].getEnd()) + 1;
    if (unused.length === imports.length && lines[after] === '') dropped.add(after);

    return lines.filter((_, index) => !dropped.has(index)).join('\n');
}

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
        writeFileSync(target, sanitizeDts(readFileSync(file, 'utf8')));
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

    const stagedPath = resolve(stagingFolder, stagedFileName(name));
    const staged = pruneUnusedImports(readFileSync(stagedPath, 'utf8'));
    // Persist the pruned report so a `--verify` failure diffs against what we actually compare.
    writeFileSync(stagedPath, staged);
    const committedPath = resolve(reportFolder, reportFileName(name));
    const committed = existsSync(committedPath) ? readFileSync(committedPath, 'utf8') : undefined;
    const apiReportChanged = staged !== committed;
    if (apiReportChanged && !verify) writeFileSync(committedPath, staged);
    return { apiReportChanged, committedPath, stagedPath };
}

// Render the surface diff between the committed report and the freshly staged one, so a
// failing `--verify` shows *what* changed rather than only telling you to re-run `api:extract`.
// Uses `git diff --no-index` (git is always present in CI) to avoid a diffing dependency. Runs
// from `root` with repo-relative paths and `committed`/`extracted` prefixes so the diff header
// reads cleanly instead of dumping absolute, machine-specific paths.
function reportDiff(committedPath: string, stagedPath: string): string {
    const result = spawnSync(
        'git',
        [
            '--no-pager',
            'diff',
            '--no-index',
            '--no-color',
            '--src-prefix=committed/',
            '--dst-prefix=extracted/',
            '--',
            relative(root, committedPath),
            relative(root, stagedPath),
        ],
        { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    // `git diff --no-index` exits 1 when files differ (expected here); only bail on a real error.
    return (result.stdout ?? '').trim() || (result.stderr ?? '').trim();
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

    // We rewrite the `.d.ts` files in place for the duration of the run (restored after) to:
    //   1. strip the `// @ts-ignore` lines the build injects, which crash Extractor's AST walker;
    //   2. rewrite `@ignore` -> `@internal` so those members get trimmed from the public report.
    const originals = new Map<string, string>();
    for (const file of globbySync('packages/*/dist/**/*.d.ts', { cwd: root, absolute: true })) {
        const content = readFileSync(file, 'utf8');
        const sanitized = sanitizeDts(content);
        if (sanitized !== content) {
            originals.set(file, content);
            writeFileSync(file, sanitized);
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
            const ok = (result: { apiReportChanged: boolean; committedPath: string; stagedPath: string }, via = '') => {
                if (verify && result.apiReportChanged) {
                    const message = `${pkg.name}: report out of date${via} — run "pnpm api:extract" and commit the changes in docs/public-api/`;
                    console.error(`✗ ${pkg.name}: report out of date${via}`);
                    // Print the actual surface diff so the failure is self-explanatory in the CI
                    // log; keep the concise message for the inline GitHub annotation.
                    const diff = reportDiff(result.committedPath, result.stagedPath);
                    if (diff) console.error(`${diff}\n`);
                    ghCommand('error', message);
                    failed++;
                } else {
                    console.log(`✓ ${pkg.name}${via}`);
                }
            };

            // Fallback: retry against the sanitized mirror (dodges an API Extractor crash on
            // cross-package re-exports of comment-injected members).
            const viaMirror = () => {
                const { packages, paths } = getMirror();
                const mirrorEntry = resolve(packages, relative(resolve(root, 'packages'), pkgDir), relative(pkgDir, entry));
                const { [pkg.name]: _self, ...deps } = paths;
                return extract(pkgDir, pkgJsonPath, mirrorEntry, deps);
            };

            try {
                ok(extract(pkgDir, pkgJsonPath, entry));
            } catch {
                try {
                    ok(viaMirror(), ' (via mirror)');
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
