import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const NON_API_KINDS = new Set([
    1, // Project
    2, // Module
    4, // Namespace
    4096, // Call signature
    8192, // Index signature
    16384, // Constructor signature
    32768, // Parameter
    65536, // Type literal
    131072, // Type parameter
    524288, // Get signature
    1048576, // Set signature
    4194304, // Reference
]);

const EXCLUDED_FLAGS = new Set(['isPrivate', 'isProtected']);
const EXCLUDED_COMMENT_TAGS = new Set(['@internal', '@ignore']);
const REFERENCE_KIND = 4194304;

function asText(parts = []) {
    return parts
        .map((part) => part.text ?? '')
        .join('')
        .trim();
}

function hasSummary(comment) {
    return asText(comment?.summary).length > 0;
}

function validateTypeDocProject(typedoc, typedocPath) {
    if (!typedoc || typeof typedoc !== 'object' || Array.isArray(typedoc) || !Array.isArray(typedoc.children)) {
        throw new Error(`Invalid TypeDoc project at ${typedocPath}: expected an object with a children array.`);
    }
}

function createReflectionIndex(typedoc) {
    const reflections = new Map();

    function indexReflection(reflection) {
        if (!reflection || typeof reflection !== 'object') return;

        if (reflection.id !== undefined) {
            reflections.set(reflection.id, reflection);
        }

        for (const child of reflection.children ?? []) indexReflection(child);
        for (const signature of reflection.signatures ?? []) indexReflection(signature);
    }

    indexReflection(typedoc);
    return reflections;
}

function inheritedTarget(reflection, reflections) {
    const target = reflection.inheritedFrom?.target;
    const targetId = target && typeof target === 'object' ? target.id : target;
    if (targetId === undefined || targetId === null) return null;

    return reflections.get(targetId) ?? (typeof targetId === 'string' ? reflections.get(Number(targetId)) : null);
}

function hasDocumentation(reflection, reflections, visited = new Set()) {
    const key = reflection.id ?? reflection;
    if (visited.has(key)) return false;
    visited.add(key);

    if (hasSummary(reflection.comment)) return true;
    if ((reflection.signatures ?? []).some((signature) => hasDocumentation(signature, reflections, visited))) return true;

    const target = inheritedTarget(reflection, reflections);
    return target ? hasDocumentation(target, reflections, visited) : false;
}

function hasExcludedMarker(reflection) {
    if ([...EXCLUDED_FLAGS].some((flag) => reflection.flags?.[flag])) {
        return true;
    }

    return (reflection.comment?.blockTags ?? []).some((tag) => EXCLUDED_COMMENT_TAGS.has(tag.tag));
}

function normalizePath(fileName = '') {
    return fileName.replaceAll('\\', '/');
}

function sourceInfo(reflection) {
    const source = reflection.sources?.[0];
    const fileName = normalizePath(source?.fileName);

    if (!fileName) {
        return { fileName: '', ownership: 'unknown' };
    }

    if (fileName.includes('/node_modules/') || fileName.startsWith('node_modules/')) {
        return { fileName, ownership: 'external' };
    }

    if (fileName.startsWith('packages/')) {
        return { fileName, ownership: 'source' };
    }

    return { fileName, ownership: 'other' };
}

function packagePathFromSource(fileName) {
    const match = fileName.match(/^(packages\/[^/]+)/);
    return match?.[1] ?? null;
}

function packageNameFor(packagePath, packageMetadata, fallback) {
    const metadata = packageMetadata.find((item) => item.packagePath === packagePath);
    return metadata?.packageName ?? fallback ?? packagePath ?? 'unknown';
}

function packageMetadataFor(root, packageMetadata) {
    const source = sourceInfo(root);
    const packagePath = packagePathFromSource(source.fileName);

    return {
        packagePath,
        packageName: packageNameFor(packagePath, packageMetadata, root.name),
    };
}

function isCountedReflection(reflection) {
    return !NON_API_KINDS.has(reflection.kind);
}

function isSupportedReflection(reflection) {
    const source = sourceInfo(reflection);

    return source.ownership === 'source' && !hasExcludedMarker(reflection);
}

function exclusionReason(reflection, source) {
    if (hasExcludedMarker(reflection)) {
        return 'visibility';
    }

    return source.ownership;
}

function qualifiedName(ancestors, reflection) {
    return [...ancestors, reflection.name].filter(Boolean).join('.');
}

function missingRow(reflection, packageInfo, ancestors, source) {
    return {
        package: packageInfo.packageName,
        packagePath: packageInfo.packagePath,
        name: reflection.name,
        qualifiedName: qualifiedName(ancestors, reflection),
        kind: reflection.kind,
        source: source.fileName,
        line: reflection.sources?.[0]?.line ?? null,
        ownership: source.ownership,
    };
}

function walkReflection(reflection, context, output) {
    const counted = isCountedReflection(reflection);
    const source = sourceInfo(reflection);
    const supported = counted && isSupportedReflection(reflection);
    const packageInfo = context.packageInfo;
    const surfaceReflection = isSupportedReflection(reflection) && (counted || reflection.kind === REFERENCE_KIND);

    if (surfaceReflection) {
        output.surfaceKeys.push(rowKey(missingRow(reflection, packageInfo, context.ancestors, source)));
    }

    if (supported) {
        output.total += 1;
        const documented = hasDocumentation(reflection, context.reflections);
        if (documented) {
            output.documented += 1;
        } else {
            output.missing.push(missingRow(reflection, packageInfo, context.ancestors, source));
        }
    } else if (counted && (source.ownership !== 'source' || hasExcludedMarker(reflection))) {
        output.excluded.push({
            ...missingRow(reflection, packageInfo, context.ancestors, source),
            reason: exclusionReason(reflection, source),
        });
    }

    for (const child of reflection.children ?? []) {
        walkReflection(child, {
            ...context,
            ancestors: [...context.ancestors, reflection.name].filter(Boolean),
        }, output);
    }
}

function createPackageReport(root, packageMetadata, reflections) {
    const packageInfo = packageMetadataFor(root, packageMetadata);
    const result = {
        package: packageInfo.packageName,
        packagePath: packageInfo.packagePath,
        total: 0,
        documented: 0,
        missing: [],
        excluded: [],
        surfaceKeys: [],
    };

    walkReflection(root, { ancestors: [], packageInfo, reflections }, result);

    return {
        ...result,
        percentage: result.total === 0 ? 100 : (result.documented / result.total) * 100,
        missing: result.missing.sort(compareRows),
        excluded: result.excluded.sort(compareRows),
        surfaceKeys: result.surfaceKeys.sort(),
    };
}

function compareRows(a, b) {
    return [a.package, a.source, a.qualifiedName, a.kind].join('\u0000').localeCompare([b.package, b.source, b.qualifiedName, b.kind].join('\u0000'));
}

function rowKey(row) {
    return [row.package, row.source, row.qualifiedName, row.kind].join('|');
}

export function createBaseline(report) {
    return {
        version: 1,
        packages: Object.fromEntries(
            report.packages.map((item) => [
                item.package,
                {
                    total: item.total,
                    documented: item.documented,
                    minimumCoverage: Number(item.percentage.toFixed(4)),
                    acceptedMissing: item.missing.map(rowKey),
                    surfaceKeys: item.surfaceKeys,
                },
            ]),
        ),
    };
}

export function checkBaseline(report, baseline) {
    const failures = [];
    const policies = baseline.packages ?? {};

    for (const actual of report.packages) {
        if (!policies[actual.package]) {
            failures.push(`${actual.package}: package has no API coverage baseline policy`);
        }
    }

    for (const [packageName, policy] of Object.entries(policies)) {
        const actual = report.packages.find((item) => item.package === packageName);
        if (!actual) {
            failures.push(`${packageName}: package is missing from the generated TypeDoc report`);
            continue;
        }

        if (actual.total < policy.total) {
            failures.push(`${packageName}: supported reflection count ${actual.total} is below baseline ${policy.total}`);
        }

        if (actual.documented < policy.documented) {
            failures.push(`${packageName}: documented count ${actual.documented} is below baseline ${policy.documented}`);
        }

        if (actual.percentage + 0.0001 < policy.minimumCoverage) {
            failures.push(`${packageName}: coverage ${actual.percentage.toFixed(1)}% is below baseline ${policy.minimumCoverage.toFixed(1)}%`);
        }

        const baselineSurface = new Set(policy.surfaceKeys ?? []);
        const actualSurface = new Set(actual.surfaceKeys ?? []);
        for (const key of baselineSurface) {
            if (!actualSurface.has(key)) {
                failures.push(`${packageName}: supported reflection was removed from the generated report ${key}`);
            }
        }

        const acceptedMissing = new Set(policy.acceptedMissing ?? []);
        const newlyMissing = actual.missing.map(rowKey).filter((key) => !acceptedMissing.has(key));
        for (const key of newlyMissing) {
            failures.push(`${packageName}: newly undocumented supported symbol ${key}`);
        }
    }

    return failures;
}

export function analyzeCoverage(typedoc, packageMetadata = [], typedocPath = '<input>') {
    validateTypeDocProject(typedoc, typedocPath);

    const roots = typedoc.children;
    const reflections = createReflectionIndex(typedoc);
    const packages = roots.map((root) => createPackageReport(root, packageMetadata, reflections));
    const total = packages.reduce((sum, item) => sum + item.total, 0);
    const documented = packages.reduce((sum, item) => sum + item.documented, 0);

    return {
        total,
        documented,
        percentage: total === 0 ? 100 : (documented / total) * 100,
        packages,
        missing: packages.flatMap((item) => item.missing).sort(compareRows),
        excluded: packages.flatMap((item) => item.excluded).sort(compareRows),
    };
}

export function formatReport(report) {
    const lines = [
        `API documentation coverage: ${report.documented}/${report.total} (${report.percentage.toFixed(1)}%)`,
        '',
        'Package                         Documented  Total  Coverage',
        '------------------------------  ----------  -----  --------',
    ];

    for (const item of report.packages) {
        lines.push(`${item.package.padEnd(30)}  ${String(item.documented).padStart(10)}  ${String(item.total).padStart(5)}  ${item.percentage.toFixed(1).padStart(7)}%`);
    }

    if (report.missing.length > 0) {
        lines.push('', `Missing descriptions (${report.missing.length}):`);
        for (const row of report.missing) {
            lines.push(`- ${row.package}: ${row.qualifiedName} (${row.source}:${row.line ?? '?'})`);
        }
    }

    lines.push('', `Excluded reflections: ${report.excluded.length}`);
    return lines.join('\n');
}

async function loadJson(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}

async function findFiles(directory, predicate) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const entryPath = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await findFiles(entryPath, predicate)));
        } else if (predicate(entryPath)) {
            files.push(entryPath);
        }
    }

    return files;
}

async function loadWorkspacePackageMetadata(projectRoot) {
    const packageFiles = await findFiles(join(projectRoot, 'packages'), (path) => path.endsWith('/package.json'));
    return Promise.all(
        packageFiles.map(async (path) => {
            const packageJson = await loadJson(path);
            const packagePath = dirname(path).replace(`${projectRoot}/`, '');
            return { packagePath, packageName: packageJson.name };
        }),
    );
}

async function findCurrentTypeDoc(projectRoot) {
    const generatedFiles = join(projectRoot, 'website', '.docusaurus');
    let candidates;
    try {
        candidates = await findFiles(generatedFiles, (path) => /api-typedoc(?:-[^/]+)?\.json$/.test(path));
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        throw new Error(`No generated TypeDoc JSON found under ${generatedFiles}. Run the Docusaurus API generation first.`);
    }

    if (candidates.length === 0) {
        throw new Error(`No generated TypeDoc JSON found under ${generatedFiles}. Run the Docusaurus API generation first.`);
    }

    const withTimes = await Promise.all(
        candidates.map(async (path) => ({ path, modified: (await stat(path)).mtimeMs })),
    );
    withTimes.sort((a, b) => b.modified - a.modified);
    return withTimes[0].path;
}

export function parseArgs(args) {
    const projectRoot = process.cwd().endsWith('/website') ? resolve(process.cwd(), '..') : process.cwd();
    const options = {
        checkCurrent: false,
        writeBaseline: false,
        typedocPath: null,
        packagesPath: null,
        baselinePath: null,
        projectRoot,
    };
    const positional = [];

    for (const arg of args) {
        if (arg === '--check-current') options.checkCurrent = true;
        else if (arg === '--write-baseline') options.writeBaseline = true;
        else if (arg.startsWith('--baseline=')) {
            options.baselinePath = resolve(arg.slice('--baseline='.length));
        } else if (arg.startsWith('--project-root=')) options.projectRoot = resolve(arg.slice('--project-root='.length));
        else positional.push(arg);
    }

    [options.typedocPath, options.packagesPath] = positional;
    options.baselinePath ??= resolve(options.projectRoot, 'website/tools/api-coverage-baseline.json');
    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    let { typedocPath, packagesPath } = options;

    if (options.checkCurrent) {
        typedocPath = await findCurrentTypeDoc(options.projectRoot);
        packagesPath = null;
    }

    if (!typedocPath) {
        console.error('Usage: node website/tools/api-coverage.mjs <api-typedoc.json> [api-packages.json]');
        console.error('   or: node website/tools/api-coverage.mjs --check-current [--project-root=<repo-root>]');
        process.exitCode = 2;
        return;
    }

    const typedocFilePath = resolve(typedocPath);
    const typedoc = await loadJson(typedocFilePath);
    validateTypeDocProject(typedoc, typedocFilePath);
    const packageMetadata = packagesPath
        ? await loadJson(resolve(packagesPath))
        : await loadWorkspacePackageMetadata(options.projectRoot);
    const report = analyzeCoverage(typedoc, packageMetadata, typedocFilePath);

    if (options.writeBaseline) {
        await writeFile(options.baselinePath, `${JSON.stringify(createBaseline(report), null, 2)}\n`);
        console.log(`Wrote API coverage baseline to ${options.baselinePath}`);
    }

    console.log(formatReport(report));

    if (options.checkCurrent) {
        let baseline;
        try {
            baseline = await loadJson(options.baselinePath);
        } catch (error) {
            throw new Error(`Unable to load API coverage baseline at ${options.baselinePath}: ${error.message}`);
        }

        const failures = checkBaseline(report, baseline);
        if (failures.length > 0) {
            console.error('\nAPI documentation coverage policy failed:');
            for (const failure of failures) console.error(`- ${failure}`);
            process.exitCode = 1;
        }
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
