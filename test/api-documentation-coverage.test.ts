import { describe, expect, it } from 'vitest';

import { analyzeCoverage, formatReport } from '../website/tools/api-coverage.mjs';

const packageMetadata = [
    {
        packagePath: 'packages/example',
        packageName: '@crawlee/example',
    },
];

function text(text: string) {
    return [{ kind: 'text', text }];
}

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

        expect(report.missing.some((row) => row.qualifiedName.includes('ExternalType'))).toBe(false);
        expect(report.missing.some((row) => row.qualifiedName.includes('InternalType'))).toBe(false);
        expect(report.missing.some((row) => row.qualifiedName.includes('DeprecatedOnly'))).toBe(true);
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
});
