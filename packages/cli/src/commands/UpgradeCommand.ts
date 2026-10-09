import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import semver from 'semver';
import type { ArgumentsCamelCase, Argv, CommandModule } from 'yargs';

interface UpgradeArgs {
    from?: number;
    to?: number;
}

const runtimePackages = new Set([
    'crawlee',
    ...[
        'basic',
        'browser',
        'browser-pool',
        'cheerio',
        'core',
        'fs-storage',
        'http',
        'http-client',
        'impit-client',
        'got-scraping-client',
        'playwright',
        'puppeteer',
        'stagehand',
        'types',
        'utils',
        'otel',
    ].map((name) => `@crawlee/${name}`),
]);

async function detectProjectMajor(): Promise<number> {
    let directory = process.cwd();
    let manifestPath: string;
    let manifest: Record<string, Record<string, string>>;

    while (true) {
        manifestPath = join(directory, 'package.json');
        try {
            manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
            break;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            const parent = dirname(directory);
            if (parent === directory) {
                throw new Error('No project package.json found. Run inside the project or specify --from <major>.');
            }
            directory = parent;
        }
    }

    const require = createRequire(manifestPath);
    const majors = new Set<number>();
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
            if (!runtimePackages.has(name)) continue;
            const range =
                typeof specifier === 'string' ? semver.validRange(specifier.replace(/^workspace:/, '')) : null;
            let installedVersion: string | null = null;
            try {
                const installed = JSON.parse(await readFile(require.resolve(`${name}/package.json`), 'utf8'));
                installedVersion = semver.valid(installed.version);
            } catch (error) {
                if (
                    !['MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED', 'ENOENT'].includes(
                        (error as NodeJS.ErrnoException).code ?? '',
                    )
                ) {
                    throw error;
                }
            }

            if (
                installedVersion &&
                (!range || semver.satisfies(installedVersion, range, { includePrerelease: true }))
            ) {
                majors.add(semver.major(installedVersion));
                continue;
            }

            const minimum = range ? semver.minVersion(range) : null;
            if (
                !minimum ||
                !semver.subset(range!, `>=${minimum.major}.0.0-0 <${minimum.major + 1}.0.0-0`, {
                    includePrerelease: true,
                })
            ) {
                throw new Error(
                    `Cannot determine the Crawlee major from ${name}: ${specifier} in ${manifestPath}. Install project dependencies or specify --from <major>.`,
                );
            }
            majors.add(minimum.major);
        }
    }

    if (majors.size !== 1) {
        const reason = majors.size
            ? `Crawlee dependencies use different majors (${[...majors].sort().join(', ')})`
            : 'No Crawlee runtime dependency found';
        throw new Error(
            `${reason} in ${manifestPath}. Run in the relevant workspace package or specify --from <major>.`,
        );
    }
    return [...majors][0];
}

function body(markdown: string): string {
    return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, '').trim();
}

export class UpgradeCommand<T> implements CommandModule<T, UpgradeArgs> {
    command = 'upgrade';
    describe = 'Prints an AI migration prompt, upgrading one Crawlee major at a time';

    builder = (args: Argv<T>) =>
        args
            .option('from', { type: 'number', describe: 'Starting major version; defaults to the project version' })
            .option('to', {
                type: 'number',
                describe: 'Target major version; defaults to the newest bundled migration',
            });

    async handler(args: ArgumentsCamelCase<UpgradeArgs>) {
        for (const [name, value] of Object.entries({ from: args.from, to: args.to })) {
            if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
                throw new Error(`--${name} must be a positive major version number.`);
            }
        }

        const skillsUrl = new URL('../skills/', import.meta.url);
        const migrations = new Map<number, URL>();
        for (const entry of await readdir(skillsUrl, { withFileTypes: true })) {
            const match = /^crawlee-upgrade-v(\d+)$/.exec(entry.name);
            if (entry.isDirectory() && match) migrations.set(Number(match[1]), new URL(`${entry.name}/`, skillsUrl));
        }
        if (!migrations.size) throw new Error('No migration guides are bundled with this CLI.');

        const from = args.from ?? (await detectProjectMajor());
        const to = args.to ?? Math.max(...migrations.keys());
        if (from >= to) {
            throw new Error(
                `The project is already on Crawlee v${from}; the target must be newer. Use --from to explicitly review an earlier migration.`,
            );
        }

        const steps: string[] = [];
        const guides: string[] = [];
        for (let major = from + 1; major <= to; major++) {
            const skillUrl = migrations.get(major);
            if (!skillUrl)
                throw new Error(
                    `No bundled migration from v${major - 1} to v${major}. Choose a supported --to version or use a CLI with that guide.`,
                );
            const skillRoot = fileURLToPath(skillUrl).replace(/\\/g, '/').replace(/\/$/, '');
            const prompt = await readFile(new URL('SKILL.md', skillUrl), 'utf8');
            steps.push(`${steps.length + 1}. Upgrade v${major - 1} to v${major}, then verify before continuing.`);
            guides.push(body(prompt).replaceAll('{SKILL_ROOT}', () => skillRoot));
        }

        const template = await readFile(new URL('crawlee-upgrade/SKILL.md', skillsUrl), 'utf8');
        const replacements: Record<string, string> = {
            FROM_MAJOR: String(from),
            TO_MAJOR: String(to),
            MIGRATION_PLAN: steps.join('\n'),
            MIGRATION_GUIDES: guides.join('\n\n---\n\n'),
        };
        const prompt = body(template).replace(
            /\{(FROM_MAJOR|TO_MAJOR|MIGRATION_PLAN|MIGRATION_GUIDES)\}/g,
            (_, key: string) => replacements[key],
        );
        process.stdout.write(`${prompt}\n`);
    }
}
