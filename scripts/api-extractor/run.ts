/* eslint-disable no-console */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

import { Extractor, ExtractorConfig, type IConfigFile } from '@microsoft/api-extractor';
import { globbySync } from 'globby';
// The workspace `typescript` is the TS 7 native compiler, which no longer ships the JS API
// this script parses reports with; `typescript-v6` is an npm alias to classic TypeScript.
import ts from 'typescript-v6';

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
 * A report should describe exactly the surface it maps: every name it mentions declared, and
 * nothing declared that it does not mention. API Extractor gets us close but not there, because
 * it decides what to *include* before it trims the non-`@public` declarations and never
 * revisits that decision. Three things follow, and we handle each after extraction:
 *
 *   1. Imports of symbols only an `@internal` member used survive the trim and read as public
 *      surface (`Cookie` from `tough-cookie` in `@crawlee/core`). We drop them —
 *      see `pruneUnusedImports`.
 *   2. Types the public API references but the entry point never exports would otherwise be
 *      named by the report and defined nowhere. `includeForgottenExports` emits them instead
 *      (without `export`, since they are observable but not importable) — the alternative was
 *      exporting ~38 types from their packages, committing us to names we never meant to
 *      publish. API Extractor labels them exactly like a real export, so we add a banner
 *      saying otherwise — see `annotateForgottenDeclarations`. The same pre-trim blind spot
 *      means it also emits declarations reachable only from trimmed members, which we drop —
 *      see `pruneDeadForgottenDeclarations`.
 *   3. What (2) cannot supply, because the release-tag trim removes it first: a `@public`
 *      signature referencing an `@internal` type. That is a genuine tagging bug in the source,
 *      so the run fails — see `danglingReferences` and `INCOMPATIBLE_RELEASE_TAGS`.
 *
 * The pruning in (1) and (2) feed each other — dropping a declaration orphans its imports — so
 * `pruneReport` runs them to a fixed point.
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

// The two API Extractor analyzer messages we act on (everything else is silenced to `none`
// in `api-extractor.base.json`); both describe a symbol the report references but never
// declares, which makes the committed surface map internally inconsistent.
//
//   ae-incompatible-release-tags — a @public symbol's signature references an @internal one.
//     The referenced type is trimmed from the @public report, so the surface map is left
//     referring to a name that appears nowhere in it. Fatal: this is a genuine tagging bug,
//     and the fix belongs in the source (drop the tag — untagged is implicitly public — or
//     keep the type out of the public signature).
//   ae-forgotten-export — a referenced symbol isn't exported from the entry point at all, so
//     the report names a type consumers cannot import. Also fatal, but only once confirmed
//     against the finished report: these messages are raised before the `@public` trim, so
//     most of them concern symbols that never reach it (see `danglingReferences`).
const INCOMPATIBLE_RELEASE_TAGS = 'ae-incompatible-release-tags';
const FORGOTTEN_EXPORT = 'ae-forgotten-export';
type AnalyzerMessageId = typeof INCOMPATIBLE_RELEASE_TAGS | typeof FORGOTTEN_EXPORT;

/** Pulls `Foo` out of `The symbol "Foo" needs to be exported by the entry point index.d.ts`. */
const quotedSymbol = (text: string) => text.match(/"([^"]+)"/)?.[1] ?? text;

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
function parseReport(report: string): { lines: string[]; open: number; close: number; source: ts.SourceFile } | undefined {
    const lines = report.split('\n');
    // The report is a fixed markdown skeleton wrapping a single ```ts fence.
    const open = lines.indexOf('```ts');
    const close = lines.lastIndexOf('```');
    if (open === -1 || close <= open) return undefined;

    const source = ts.createSourceFile(
        'report.ts',
        lines.slice(open + 1, close).join('\n'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    // `parseDiagnostics` is internal, but there is no public per-file equivalent that doesn't
    // require a whole Program. A report that doesn't parse means our assumptions are broken,
    // so skip the analysis rather than act on a half-understood tree.
    const diagnostics = (source as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics;
    if (diagnostics?.length) {
        const message = `report did not parse (${diagnostics.length} syntax errors) — skipping import pruning and the dangling-reference check`;
        console.warn(`! ${message}`);
        ghCommand('warning', message);
        return undefined;
    }
    return { lines, open, close, source };
}

function pruneUnusedImports(report: string): string {
    const parsed = parseReport(report);
    if (!parsed) return report;
    const { lines, open, close, source } = parsed;

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

/**
 * Drops forgotten-export declarations that nothing in the report refers to.
 *
 * `includeForgottenExports` emits a declaration for every symbol the entry point failed to
 * export, but API Extractor decides that before the `@public` trim — so it also emits the ones
 * reachable only from members that never make it into the report. Those exist to back a
 * reference that isn't there, and they drag their own imports back in with them.
 *
 * Eligibility comes from API Extractor's own `ae-forgotten-export` list rather than from the
 * absence of an `export` keyword. Missing `export` is not sufficient: `export * as ns` is
 * rendered as `declare namespace ns { export { ... } }`, which also carries no export modifier
 * yet is a real part of the surface — and removing it would cascade into everything it names
 * (`@crawlee/utils`' `social` namespace and all its members). Only symbols API Extractor could
 * not export are candidates, so nothing that is genuinely reachable can be dropped.
 */
function pruneDeadForgottenDeclarations(report: string, forgotten: ReadonlySet<string>): string {
    if (forgotten.size === 0) return report;
    const parsed = parseReport(report);
    if (!parsed) return report;
    const { lines, open, close, source } = parsed;

    // Positions, not counts: a declaration must not keep itself alive. Backend classes here
    // name themselves (`static create(): Promise<DatasetBackend>`), so a plain occurrence count
    // would never let one go.
    const occurrences = new Map<string, number[]>();
    const record = (node: ts.Node) => {
        // Only genuine references count. `storage.DatasetBackend` on an unrelated method must not
        // keep the local `DatasetBackend` class alive, and nor must a member of the same name.
        if (ts.isIdentifier(node) && !isDeclarationName(node)) {
            const positions = occurrences.get(node.text);
            if (positions) positions.push(node.getStart(source));
            else occurrences.set(node.text, [node.getStart(source)]);
        }
        node.forEachChild(record);
    };
    source.forEachChild(record);

    const dead = source.statements.filter((statement) => {
        if (isImport(statement) || ts.isExportDeclaration(statement)) return false;
        const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
        if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return false;
        const names = ts.isVariableStatement(statement)
            ? statement.declarationList.declarations.map((declaration) => declaration.name)
            : [(statement as { name?: ts.Node }).name];
        if (names.length === 0 || !names.every((name) => name && ts.isIdentifier(name))) return false;
        const from = statement.getStart(source);
        const to = statement.getEnd();
        return (names as ts.Identifier[]).every(
            (name) =>
                forgotten.has(name.text)
                && !(occurrences.get(name.text) ?? []).some((position) => position < from || position > to),
        );
    });
    if (dead.length === 0) return report;

    const lineOf = (position: number) => open + 1 + source.getLineAndCharacterOfPosition(position).line;
    const dropped = new Set<number>();
    for (const statement of dead) {
        // Take the `// @public (undocumented)` banner API Extractor writes above the declaration
        // with it. Ask for the actual comment ranges rather than working back from
        // `getFullStart()`, which sits at the end of the *previous* statement.
        const comments = ts.getLeadingCommentRanges(source.text, statement.getFullStart()) ?? [];
        const start = lineOf(comments[0]?.pos ?? statement.getStart(source));
        for (let line = start; line <= lineOf(statement.getEnd()); line++) dropped.add(line);
        // Also take the blank line that separated it from the previous entry, so the neighbours
        // don't end up glued together.
        if (start - 1 > open && lines[start - 1].trim() === '') dropped.add(start - 1);
    }
    return lines.filter((_, index) => !dropped.has(index)).join('\n');
}

/**
 * Removes everything the report carries but does not need: forgotten-export declarations
 * nothing refers to, and imports nothing refers to. Each pass can expose more of the other
 * (dropping a declaration orphans the imports it used), so this runs to a fixed point. It
 * always terminates — every pass that changes anything strictly removes lines.
 */
function pruneReport(report: string, forgotten: ReadonlySet<string>): string {
    for (let current = report; ; ) {
        const next = pruneUnusedImports(pruneDeadForgottenDeclarations(current, forgotten));
        if (next === current) return current;
        current = next;
    }
}

/** Banner marking a declaration that is observable but not importable. */
const NOT_EXPORTED_BANNER = '// Not exported by the entry point; reachable only as a referenced type.';

/**
 * Labels the declarations `includeForgottenExports` contributed.
 *
 * Without this they render as `// @public (undocumented)`, identical to a genuine export apart
 * from a missing `export` keyword — far too subtle to survive review. The distinction matters:
 * their *shape* is part of the surface we promise not to break, but their *name* is not
 * something a consumer can import.
 */
function annotateForgottenDeclarations(report: string, forgotten: ReadonlySet<string>): string {
    if (forgotten.size === 0) return report;
    const parsed = parseReport(report);
    if (!parsed) return report;
    const { lines, open, source } = parsed;

    const lineOf = (position: number) => open + 1 + source.getLineAndCharacterOfPosition(position).line;
    const marked = new Set<number>();
    for (const statement of source.statements) {
        if (isImport(statement) || ts.isExportDeclaration(statement)) continue;
        const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
        if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
        const names = ts.isVariableStatement(statement)
            ? statement.declarationList.declarations.map((declaration) => declaration.name)
            : [(statement as { name?: ts.Node }).name];
        if (!names.length || !names.every((name) => name && ts.isIdentifier(name) && forgotten.has(name.text))) continue;
        // Sit above API Extractor's own banner rather than replacing it, so its markers survive.
        const comments = ts.getLeadingCommentRanges(source.text, statement.getFullStart()) ?? [];
        const at = lineOf(comments[0]?.pos ?? statement.getStart(source));
        // Our banner becomes a leading comment itself, so skip anything already labelled. The
        // staged report is regenerated from scratch each run and never arrives annotated, but
        // that is a property of the caller, not of this function.
        if (lines[at] !== NOT_EXPORTED_BANNER) marked.add(at);
    }
    if (marked.size === 0) return report;

    return lines.flatMap((line, index) => (marked.has(index) ? [NOT_EXPORTED_BANNER, line] : [line])).join('\n');
}

/** True when the identifier names something (a declaration, member or property) rather than referring to it. */
function isDeclarationName(id: ts.Identifier): boolean {
    const parent = id.parent as ts.Node | undefined;
    if (!parent) return false;
    // `a.b` / `A.B` — only the leftmost part resolves against the report's own scope.
    if (ts.isQualifiedName(parent) && parent.right === id) return true;
    if (ts.isPropertyAccessExpression(parent) && parent.name === id) return true;
    // `export { x }` (as a `declare namespace` uses to re-expose its members) names the local
    // binding, so it is a reference to it rather than a declaration of it.
    if (ts.isExportSpecifier(parent)) return false;
    return 'name' in parent && (parent as { name?: ts.Node }).name === id;
}

/** Names the report introduces itself: top-level declarations plus whatever the imports bind. */
function declaredNames(source: ts.SourceFile): Set<string> {
    const names = new Set<string>();
    for (const statement of source.statements) {
        if (isImport(statement)) {
            for (const binding of importBindings(statement)) names.add(binding);
        } else if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
                if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
            }
        } else {
            const name = (statement as { name?: ts.Node }).name;
            if (name && ts.isIdentifier(name)) names.add(name.text);
        }
    }
    return names;
}

/**
 * Names the report refers to but never declares or imports, leaving the committed surface map
 * describing types a consumer cannot actually name.
 *
 * `candidates` comes from API Extractor's `ae-forgotten-export` messages. Restricting the search
 * to those is what makes this check cheap and exact: deciding "is this identifier unresolved?"
 * from scratch would mean re-implementing name resolution over the TypeScript globals, whereas
 * API Extractor has already told us precisely which symbols it could not export.
 *
 * The filtering matters in the other direction too. Those messages are raised during analysis,
 * *before* the `@public` trim, so most of them concern symbols reachable only from members that
 * never make it into the report — harmless, and not something the source should be contorted to
 * fix. Checking the finished artifact instead of the raw message list keeps only the real ones.
 */
function danglingReferences(report: string, candidates: Iterable<string>): string[] {
    const wanted = new Set(candidates);
    if (wanted.size === 0) return [];
    const parsed = parseReport(report);
    if (!parsed) return [];

    const declared = declaredNames(parsed.source);
    const dangling = new Set<string>();
    const visit = (node: ts.Node) => {
        if (ts.isIdentifier(node) && wanted.has(node.text) && !declared.has(node.text) && !isDeclarationName(node)) {
            dangling.add(node.text);
        }
        node.forEachChild(visit);
    };
    parsed.source.forEachChild(visit);
    return [...dangling].sort();
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
                // Emit declarations for symbols the public API references but the entry point
                // never exports, instead of leaving the report referring to names that appear
                // nowhere in it. They are emitted *without* `export`, which is the honest
                // rendering: the shape is part of the observable surface and is tracked for BC,
                // but the name is not importable. The alternative — exporting every such type
                // from its package — would have added ~38 new public exports here, committing us
                // to names we never meant to publish, so we track the shape instead.
                includeForgottenExports: true,
                reportFileName: reportFileName(name),
                // Stage into temp; we promote the `.public.api.md` output onto the committed
                // `<base>.api.md` ourselves so the tracked filenames don't change.
                reportFolder: stagingFolder,
                reportTempFolder: stagingFolder,
            },
        },
    });
    // Collected rather than printed, so `main` decides severity and the output stays grouped
    // per package. Duplicates are common (one message per overload/declaration), hence the Set.
    const diagnostics: Record<AnalyzerMessageId, Set<string>> = {
        [INCOMPATIBLE_RELEASE_TAGS]: new Set(),
        [FORGOTTEN_EXPORT]: new Set(),
    };
    // Let API Extractor always write the staged report (localBuild), then diff it against the
    // committed report ourselves so `--verify` keys off the stable `<base>.api.md` name.
    Extractor.invoke(config, {
        localBuild: true,
        showVerboseMessages: false,
        messageCallback: (message) => {
            diagnostics[message.messageId as AnalyzerMessageId]?.add(message.text);
            // Suppress API Extractor's own console output; everything else is already `none`.
            message.handled = true;
        },
    });

    const forgotten = new Set([...diagnostics[FORGOTTEN_EXPORT]].map(quotedSymbol));
    const stagedPath = resolve(stagingFolder, stagedFileName(name));
    // Annotate after pruning, so declarations that are about to be dropped are never labelled.
    const staged = annotateForgottenDeclarations(pruneReport(readFileSync(stagedPath, 'utf8'), forgotten), forgotten);
    // Persist the pruned report so a `--verify` failure diffs against what we actually compare.
    writeFileSync(stagedPath, staged);
    const committedPath = resolve(reportFolder, reportFileName(name));
    const committed = existsSync(committedPath) ? readFileSync(committedPath, 'utf8') : undefined;
    const apiReportChanged = staged !== committed;
    if (apiReportChanged && !verify) writeFileSync(committedPath, staged);

    // Anything still referenced but neither declared nor imported after the pruning above —
    // i.e. a forgotten export that `includeForgottenExports` could not supply because the
    // release-tag trim dropped it first (see `danglingReferences`).
    const unexported = danglingReferences(staged, forgotten);
    return { apiReportChanged, committedPath, stagedPath, diagnostics, unexported };
}

type ExtractResult = ReturnType<typeof extract>;

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

            // Up to date iff the committed report didn't change, and the report is internally
            // consistent (no @public symbol referencing a trimmed @internal one). Both modes
            // enforce consistency: unlike an out-of-date report, regenerating can't fix it.
            const ok = (result: ExtractResult, via = '') => {
                if (result.unexported.length > 0) {
                    const message = `${pkg.name}: referenced by the public API but not exported from the entry point: ${result.unexported.join(', ')} — export them, or keep them out of the public signature`;
                    console.error(`✗ ${message}`);
                    ghCommand('error', message);
                    failed++;
                }

                const inconsistent = result.diagnostics[INCOMPATIBLE_RELEASE_TAGS];
                for (const text of inconsistent) {
                    const message = `${pkg.name}: ${text} — the referenced symbol is trimmed from the public report, leaving a dangling reference; drop the tag, or keep the type out of the public signature`;
                    console.error(`✗ ${message}`);
                    ghCommand('error', message);
                    failed++;
                }

                if (verify && result.apiReportChanged) {
                    const message = `${pkg.name}: report out of date${via} — run "pnpm api:extract" and commit the changes in docs/public-api/`;
                    console.error(`✗ ${pkg.name}: report out of date${via}`);
                    // Print the actual surface diff so the failure is self-explanatory in the CI
                    // log; keep the concise message for the inline GitHub annotation.
                    const diff = reportDiff(result.committedPath, result.stagedPath);
                    if (diff) console.error(`${diff}\n`);
                    ghCommand('error', message);
                    failed++;
                } else if (inconsistent.size === 0 && result.unexported.length === 0) {
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
