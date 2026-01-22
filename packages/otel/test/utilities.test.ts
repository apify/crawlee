import type { ClassMethodToInstrument } from '@crawlee/otel';
import { diag } from '@opentelemetry/api';

import { buildModuleDefinitions } from '../src/utilities';

describe('buildModuleDefinitions', () => {
    let diagWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        diagWarnSpy = vi.spyOn(diag, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        diagWarnSpy.mockRestore();
    });

    test('builds module definitions from method list', () => {
        const methods: ClassMethodToInstrument[] = [
            {
                moduleName: '@crawlee/basic',
                className: 'BasicCrawler',
                methodName: 'run',
                spanName: 'crawlee.crawler.run',
            },
            {
                moduleName: '@crawlee/basic',
                className: 'BasicCrawler',
                methodName: '_runTaskFunction',
                spanName: 'crawlee.crawler.runTaskFunction',
            },
        ];

        const definitions = buildModuleDefinitions(methods);

        expect(definitions).toHaveLength(1);
        expect(definitions[0].moduleName).toBe('@crawlee/basic');
        expect(definitions[0].classMethodPatches).toHaveLength(2);
        expect(definitions[0].classMethodPatches[0]).toEqual({
            className: 'BasicCrawler',
            methodName: 'run',
            spanName: 'crawlee.crawler.run',
            spanOptions: undefined,
        });
        expect(definitions[0].classMethodPatches[1]).toEqual({
            className: 'BasicCrawler',
            methodName: '_runTaskFunction',
            spanName: 'crawlee.crawler.runTaskFunction',
            spanOptions: undefined,
        });
    });

    test('groups methods by module name', () => {
        const methods: ClassMethodToInstrument[] = [
            {
                moduleName: '@crawlee/basic',
                className: 'BasicCrawler',
                methodName: 'run',
                spanName: 'basic.run',
            },
            {
                moduleName: '@crawlee/browser',
                className: 'BrowserCrawler',
                methodName: '_handleNavigation',
                spanName: 'browser.navigation',
            },
            {
                moduleName: '@crawlee/basic',
                className: 'BasicCrawler',
                methodName: '_executeHooks',
                spanName: 'basic.hooks',
            },
        ];

        const definitions = buildModuleDefinitions(methods);

        expect(definitions).toHaveLength(2);

        const basicDef = definitions.find((d) => d.moduleName === '@crawlee/basic');
        const browserDef = definitions.find((d) => d.moduleName === '@crawlee/browser');

        expect(basicDef?.classMethodPatches).toHaveLength(2);
        expect(browserDef?.classMethodPatches).toHaveLength(1);
    });

    test('skips non-crawlee modules and logs warning', () => {
        const methods: ClassMethodToInstrument[] = [
            {
                moduleName: 'some-other-package',
                className: 'SomeClass',
                methodName: 'someMethod',
                spanName: 'some-span',
            },
            {
                moduleName: '@crawlee/basic',
                className: 'BasicCrawler',
                methodName: 'run',
                spanName: 'basic.run',
            },
        ];

        const definitions = buildModuleDefinitions(methods);

        expect(definitions).toHaveLength(1);
        expect(definitions[0].moduleName).toBe('@crawlee/basic');
        expect(diagWarnSpy).toHaveBeenCalledWith('Module some-other-package is not a valid Crawlee module. Skipping.');
    });

    test('skips duplicate method instrumentation and logs warning', () => {
        const methods: ClassMethodToInstrument[] = [
            {
                moduleName: '@crawlee/basic',
                className: 'BasicCrawler',
                methodName: 'run',
                spanName: 'first-span',
            },
            {
                moduleName: '@crawlee/basic',
                className: 'BasicCrawler',
                methodName: 'run',
                spanName: 'duplicate-span',
            },
        ];

        const definitions = buildModuleDefinitions(methods);

        expect(definitions).toHaveLength(1);
        expect(definitions[0].classMethodPatches).toHaveLength(1);
        expect(definitions[0].classMethodPatches[0].spanName).toBe('first-span');
        expect(diagWarnSpy).toHaveBeenCalledWith('Method BasicCrawler.run is already instrumented. Skipping.');
    });

    test('allows same method name on different classes', () => {
        const methods: ClassMethodToInstrument[] = [
            {
                moduleName: '@crawlee/basic',
                className: 'BasicCrawler',
                methodName: 'run',
                spanName: 'basic.run',
            },
            {
                moduleName: '@crawlee/basic',
                className: 'AnotherCrawler',
                methodName: 'run',
                spanName: 'another.run',
            },
        ];

        const definitions = buildModuleDefinitions(methods);

        expect(definitions).toHaveLength(1);
        expect(definitions[0].classMethodPatches).toHaveLength(2);
    });

    test('preserves spanOptions function', () => {
        const spanOptionsFn = (ctx: any) => ({
            attributes: { 'test.attr': ctx.value },
        });

        const methods: ClassMethodToInstrument[] = [
            {
                moduleName: '@crawlee/basic',
                className: 'BasicCrawler',
                methodName: 'run',
                spanName: 'span-with-options',
                spanOptions: spanOptionsFn,
            },
        ];

        const definitions = buildModuleDefinitions(methods);

        expect(definitions[0].classMethodPatches[0].spanOptions).toBe(spanOptionsFn);
    });

    test('returns empty array for empty input', () => {
        const definitions = buildModuleDefinitions([]);

        expect(definitions).toEqual([]);
    });

    test('handles multiple modules with multiple classes', () => {
        const methods: ClassMethodToInstrument[] = [
            {
                moduleName: '@crawlee/basic',
                className: 'BasicCrawler',
                methodName: 'run',
            },
            {
                moduleName: '@crawlee/basic',
                className: 'BasicCrawler',
                methodName: 'stop',
            },
            {
                moduleName: '@crawlee/browser',
                className: 'BrowserCrawler',
                methodName: 'run',
            },
            {
                moduleName: '@crawlee/browser',
                className: 'BrowserCrawler',
                methodName: '_handleNavigation',
            },
            {
                moduleName: '@crawlee/http',
                className: 'HttpCrawler',
                methodName: 'run',
            },
        ];

        const definitions = buildModuleDefinitions(methods);

        expect(definitions).toHaveLength(3);

        const basicDef = definitions.find((d) => d.moduleName === '@crawlee/basic');
        const browserDef = definitions.find((d) => d.moduleName === '@crawlee/browser');
        const httpDef = definitions.find((d) => d.moduleName === '@crawlee/http');

        expect(basicDef?.classMethodPatches).toHaveLength(2);
        expect(browserDef?.classMethodPatches).toHaveLength(2);
        expect(httpDef?.classMethodPatches).toHaveLength(1);
    });
});
