import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
    analyzeCoverage,
    checkBaseline,
    createBaseline,
    formatReport,
    parseArgs,
} from '../website/tools/api-coverage.mjs';

const packageMetadata = [
    {
        packagePath: 'packages/example',
        packageName: '@crawlee/example',
    },
];

function text(content: string) {
    return [{ kind: 'text', text: content }];
}

const execFileAsync = promisify(execFile);

function fixture() {
    return {
        children: [
            {
                name: 'example/src',
                kind: 2,
                sources: [{ fileName: 'packages/example/src/index.ts', line: 1 }],
                children: [
                    {
                        name: 'DocumentedClass',
                        kind: 128,
                        sources: [{ fileName: 'packages/example/src/index.ts', line: 5 }],
                        comment: { summary: text('A documented class.') },
                        children: [
                            {
                                name: 'missingProperty',
                                kind: 1024,
                                sources: [{ fileName: 'packages/example/src/index.ts', line: 8 }],
                            },
                            {
                                name: 'documentedMethod',
                                kind: 2048,
                                sources: [{ fileName: 'packages/example/src/index.ts', line: 10 }],
                                signatures: [
                                    {
                                        name: 'documentedMethod',
                                        kind: 4096,
                                        comment: { summary: text('A method documented on its signature.') },
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        name: 'DeprecatedOnly',
                        kind: 256,
                        sources: [{ fileName: 'packages/example/src/index.ts', line: 15 }],
                        comment: {
                            blockTags: [{ tag: '@deprecated', content: text('Use another type.') }],
                        },
                    },
                    {
                        name: 'ExternalType',
                        kind: 256,
                        sources: [{ fileName: 'node_modules/external/index.d.ts', line: 1 }],
                    },
                    {
                        name: 'InternalType',
                        kind: 256,
                        sources: [{ fileName: 'packages/example/src/internal.ts', line: 1 }],
                        comment: {
                            blockTags: [{ tag: '@internal', content: text('Not public.') }],
                        },
                    },
                ],
            },
        ],
    };
}

function inheritedFixture() {
    return {
        children: [
            {
                name: 'example/src',
                kind: 2,
                sources: [{ fileName: 'packages/example/src/index.ts', line: 1 }],
                children: [
                    {
                        id: 100,
                        name: 'BaseProperty',
                        kind: 1024,
                        sources: [{ fileName: 'packages/example/src/base.ts', line: 1 }],
                        comment: { summary: text('Inherited documentation.') },
                    },
                    {
                        id: 101,
                        name: 'InheritedProperty',
                        kind: 1024,
                        sources: [{ fileName: 'packages/example/src/derived.ts', line: 1 }],
                        inheritedFrom: { type: 'reference', target: 100, name: 'BaseProperty' },
                    },
                    {
                        id: 102,
                        name: 'IndirectlyInheritedProperty',
                        kind: 1024,
                        sources: [{ fileName: 'packages/example/src/derived.ts', line: 2 }],
                        inheritedFrom: { type: 'reference', target: 101, name: 'InheritedProperty' },
                    },
                    {
                        id: 103,
                        name: 'CyclicPropertyA',
                        kind: 1024,
                        sources: [{ fileName: 'packages/example/src/cycles.ts', line: 1 }],
                        inheritedFrom: { type: 'reference', target: 104, name: 'CyclicPropertyB' },
                    },
                    {
                        id: 104,
                        name: 'CyclicPropertyB',
                        kind: 1024,
                        sources: [{ fileName: 'packages/example/src/cycles.ts', line: 2 }],
                        inheritedFrom: { type: 'reference', target: 103, name: 'CyclicPropertyA' },
                    },
                ],
            },
        ],
    };
}

describe('API documentation coverage', () => {
    it('counts source-owned declarations and signature comments', () => {
        const report = analyzeCoverage(fixture(), packageMetadata);

        expect(report.total).toBe(4);
        expect(report.documented).toBe(2);
        expect(report.packages[0]).toMatchObject({
            package: '@crawlee/example',
            total: 4,
            documented: 2,
        });
        expect(report.missing).toHaveLength(2);
        expect(report.missing).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    qualifiedName: 'example/src.DocumentedClass.missingProperty',
                    kind: 1024,
                    source: 'packages/example/src/index.ts',
                    line: 8,
                }),
                expect.objectContaining({
                    qualifiedName: 'example/src.DeprecatedOnly',
                    kind: 256,
                }),
            ]),
        );
    });

    it('excludes external and intentionally hidden reflections', () => {
        const report = analyzeCoverage(fixture(), packageMetadata);

        expect(
            report.missing.some((row: { qualifiedName: string }) => row.qualifiedName.includes('ExternalType')),
        ).toBe(false);
        expect(
            report.missing.some((row: { qualifiedName: string }) => row.qualifiedName.includes('InternalType')),
        ).toBe(false);
        expect(
            report.missing.some((row: { qualifiedName: string }) => row.qualifiedName.includes('DeprecatedOnly')),
        ).toBe(true);
        expect(report.excluded).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ ownership: 'external', reason: 'external' }),
                expect.objectContaining({ reason: 'visibility' }),
            ]),
        );
    });

    it('formats package totals and actionable missing rows', () => {
        const output = formatReport(analyzeCoverage(fixture(), packageMetadata));

        expect(output).toContain('API documentation coverage: 2/4 (50.0%)');
        expect(output).toContain('@crawlee/example');
        expect(output).toContain('example/src.DocumentedClass.missingProperty');
    });

    it('ratchets against a baseline and rejects newly missing symbols', () => {
        const report = analyzeCoverage(fixture(), packageMetadata);
        const baseline = createBaseline(report);

        expect(checkBaseline(report, baseline)).toEqual([]);
        expect(
            checkBaseline(report, {
                ...baseline,
                packages: {
                    ...baseline.packages,
                    '@crawlee/example': {
                        ...baseline.packages['@crawlee/example'],
                        acceptedMissing: [],
                    },
                },
            }),
        ).toEqual(expect.arrayContaining([expect.stringContaining('newly undocumented supported symbol')]));

        expect(
            checkBaseline(
                {
                    ...report,
                    packages: [
                        ...report.packages,
                        { package: '@crawlee/new', documented: 0, total: 0, percentage: 100, missing: [] },
                    ],
                },
                baseline,
            ),
        ).toEqual(expect.arrayContaining(['@crawlee/new: package has no API coverage baseline policy']));

        expect(
            checkBaseline(
                {
                    ...report,
                    packages: [{ ...report.packages[0], total: 3, missing: [] }],
                },
                baseline,
            ),
        ).toEqual(expect.arrayContaining(['@crawlee/example: supported reflection count 3 is below baseline 4']));
    });

    it('resolves inherited summaries recursively without looping on cycles', () => {
        const report = analyzeCoverage(inheritedFixture(), packageMetadata);

        expect(report.total).toBe(5);
        expect(report.documented).toBe(3);
        expect(report.missing.map((row: { name: string }) => row.name)).toEqual(['CyclicPropertyA', 'CyclicPropertyB']);
    });

    it('rejects malformed TypeDoc input with the input path', () => {
        expect(() =>
            analyzeCoverage({ name: 'not-a-project' }, packageMetadata, '/tmp/malformed-typedoc.json'),
        ).toThrow('Invalid TypeDoc project at /tmp/malformed-typedoc.json: expected an object with a children array.');
    });

    it('gives Docusaurus guidance when generated TypeDoc output is missing', async () => {
        const result = execFileAsync(process.execPath, [
            'website/tools/api-coverage.mjs',
            '--check-current',
            `--project-root=/tmp/crawlee-api-coverage-missing-${process.pid}`,
        ]);

        await expect(result).rejects.toMatchObject({
            stderr: expect.stringContaining('Run the Docusaurus API generation first.'),
        });
    });

    it('resolves the default baseline beside an explicit project root', () => {
        const options = parseArgs(['--check-current', '--project-root=/tmp/example']);

        expect(options.baselinePath).toBe('/tmp/example/website/tools/api-coverage-baseline.json');
    });
});
