import { CrawleeInstrumentation } from '@crawlee/otel';
import { ATTR_HTTP_REQUEST_METHOD, ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import { isWrapped } from '@opentelemetry/instrumentation';
import { satisfies } from 'semver';

import { baseConfig, requestHandlingInstrumentationMethods } from '../src/constants';

describe('CrawleeInstrumentation', () => {
    describe('constructor and configuration', () => {
        test('creates instrumentation with default config', () => {
            const instrumentation = new CrawleeInstrumentation();

            expect(instrumentation.instrumentationName).toBe('@crawlee/otel');
            expect(instrumentation.getConfig()).toMatchObject({
                enabled: true,
                requestHandlingInstrumentation: true,
                logInstrumentation: true,
                customInstrumentation: [],
            });
        });

        test('merges provided config with defaults', () => {
            const instrumentation = new CrawleeInstrumentation({
                requestHandlingInstrumentation: false,
                logInstrumentation: false,
            });

            expect(instrumentation.getConfig()).toMatchObject({
                enabled: true, // default
                requestHandlingInstrumentation: false, // overridden
                logInstrumentation: false, // overridden
                customInstrumentation: [], // default
            });
        });

        test('an explicitly undefined flag keeps its default', () => {
            // What `{ logInstrumentation: options.logs }` produces when the caller has no opinion about it.
            const instrumentation = new CrawleeInstrumentation({
                enabled: undefined,
                requestHandlingInstrumentation: undefined,
                logInstrumentation: undefined,
                customInstrumentation: undefined,
            });

            expect(instrumentation.getConfig()).toMatchObject({
                enabled: true,
                requestHandlingInstrumentation: true,
                logInstrumentation: true,
                customInstrumentation: [],
            });
        });

        test('accepts custom instrumentation config', () => {
            const customMethods = [
                {
                    moduleName: '@crawlee/basic',
                    className: 'BasicCrawler',
                    methodName: 'customMethod',
                    spanName: 'custom.span',
                },
            ];

            const instrumentation = new CrawleeInstrumentation({
                customInstrumentation: customMethods,
            });

            expect(instrumentation.getConfig().customInstrumentation).toEqual(customMethods);
        });

        test('can disable instrumentation entirely', () => {
            const instrumentation = new CrawleeInstrumentation({
                enabled: false,
            });

            expect(instrumentation.getConfig().enabled).toBe(false);
        });
    });

    describe('init method', () => {
        test('returns module definitions when request handling instrumentation enabled', () => {
            const instrumentation = new CrawleeInstrumentation({
                requestHandlingInstrumentation: true,
                logInstrumentation: false,
            });

            // Access protected init method for testing
            const definitions = (instrumentation as any).init();

            expect(definitions.length).toBeGreaterThan(0);
        });

        test('returns fewer definitions when request handling disabled', () => {
            const withHandling = new CrawleeInstrumentation({
                requestHandlingInstrumentation: true,
                logInstrumentation: false,
            });

            const withoutHandling = new CrawleeInstrumentation({
                requestHandlingInstrumentation: false,
                logInstrumentation: false,
            });

            const defsWithHandling = (withHandling as any).init();
            const defsWithoutHandling = (withoutHandling as any).init();

            expect(defsWithHandling.length).toBeGreaterThan(defsWithoutHandling.length);
        });

        test('includes log instrumentation when enabled', () => {
            const instrumentation = new CrawleeInstrumentation({
                requestHandlingInstrumentation: false,
                logInstrumentation: true,
            });

            const definitions = (instrumentation as any).init();

            const logDefinition = definitions.find((d: any) => d.name === '@crawlee/core');
            expect(logDefinition).toBeDefined();
        });

        test('excludes log instrumentation when disabled', () => {
            const instrumentation = new CrawleeInstrumentation({
                requestHandlingInstrumentation: false,
                logInstrumentation: false,
            });

            const definitions = (instrumentation as any).init();

            const logDefinition = definitions.find((d: any) => d.name === '@crawlee/core');
            expect(logDefinition).toBeUndefined();
        });

        test('combines default and custom instrumentation', () => {
            const instrumentation = new CrawleeInstrumentation({
                requestHandlingInstrumentation: true,
                logInstrumentation: false,
                customInstrumentation: [
                    {
                        moduleName: '@crawlee/basic',
                        className: 'BasicCrawler',
                        methodName: 'customMethod',
                        spanName: 'custom.span',
                    },
                ],
            });

            const definition = (instrumentation as any).init().find((d: any) => d.name === '@crawlee/basic') as {
                patch: (e: any) => any;
            };

            class BasicCrawler {
                run() {}
                customMethod() {}
            }
            definition.patch({ BasicCrawler });

            // Both the built-in method and the configured one, rather than just a non-empty definition list.
            expect(isWrapped(BasicCrawler.prototype.run)).toBe(true);
            expect(isWrapped(BasicCrawler.prototype.customMethod)).toBe(true);
        });
    });

    describe('setConfig', () => {
        test('allows runtime config changes', () => {
            const instrumentation = new CrawleeInstrumentation({
                enabled: true,
            });

            instrumentation.setConfig({ enabled: false });

            expect(instrumentation.getConfig().enabled).toBe(false);
        });
    });
});

describe('baseConfig', () => {
    test('has expected default values', () => {
        expect(baseConfig).toEqual({
            enabled: true,
            requestHandlingInstrumentation: true,
            logInstrumentation: true,
            customInstrumentation: [],
        });
    });
});

describe('requestHandlingInstrumentationMethods', () => {
    test('contains expected BasicCrawler methods', () => {
        const basicMethods = requestHandlingInstrumentationMethods.filter(
            (m: { moduleName: string }) => m.moduleName === '@crawlee/basic',
        );

        expect(basicMethods.length).toBeGreaterThan(0);

        const methodNames = basicMethods.map((m: { methodName: any }) => m.methodName);
        expect(methodNames).toContain('run');
        expect(methodNames).toContain('handleRequest');
        expect(methodNames).toContain('runRequestHandler');
        expect(methodNames).toContain('requestFunctionErrorHandler');
        expect(methodNames).toContain('handleFailedRequestHandler');
    });

    test('contains expected BrowserCrawler methods', () => {
        const browserMethods = requestHandlingInstrumentationMethods.filter(
            (m: { moduleName: string }) => m.moduleName === '@crawlee/browser',
        );

        expect(browserMethods.length).toBeGreaterThan(0);

        const methodNames = browserMethods.map((m: { methodName: any }) => m.methodName);
        expect(methodNames).toContain('navigate');
    });

    test('contains expected HttpCrawler methods', () => {
        const httpMethods = requestHandlingInstrumentationMethods.filter(
            (m: { moduleName: string }) => m.moduleName === '@crawlee/http',
        );

        expect(httpMethods.length).toBeGreaterThan(0);

        const methodNames = httpMethods.map((m: { methodName: any }) => m.methodName);
        expect(methodNames).toContain('makeHttpRequest');
    });

    test('all methods have valid moduleName starting with @crawlee/', () => {
        for (const method of requestHandlingInstrumentationMethods) {
            expect(method.moduleName).toMatch(/^@crawlee\//);
        }
    });

    test('all methods have required properties', () => {
        for (const method of requestHandlingInstrumentationMethods) {
            expect(method.moduleName).toBeDefined();
            expect(method.className).toBeDefined();
            expect(method.methodName).toBeDefined();
            expect(method.spanName).toBeDefined();
        }
    });

    test.each([
        // [methodName, index of the crawling context in the argument list]
        ['handleRequest', 0],
        ['runRequestHandler', 0],
        ['makeHttpRequest', 0],
        ['navigate', 0],
        ['handleFailedRequestHandler', 0],
        // `requestFunctionErrorHandler(error, crawlingContext, request, source)`
        ['requestFunctionErrorHandler', 1],
    ])('%s reads request attributes from argument %i', (methodName, contextArgIndex) => {
        const methods = requestHandlingInstrumentationMethods.filter((m) => m.methodName === methodName);
        expect(methods.length).toBeGreaterThan(0);

        const mockContext = {
            request: {
                id: 'test-id',
                url: 'https://example.com',
                method: 'GET',
                retryCount: 0,
            },
        };
        const args = Array.from({ length: contextArgIndex + 1 });
        args[contextArgIndex] = mockContext;

        for (const method of methods) {
            expect(typeof method.spanOptions).toBe('function');

            // oxlint-disable-next-line no-unsafe-function-type
            const options = (method.spanOptions as Function)(...args);
            expect(options.attributes).toEqual({
                'crawlee.request.id': 'test-id',
                [ATTR_URL_FULL]: 'https://example.com',
                [ATTR_HTTP_REQUEST_METHOD]: 'GET',
                'crawlee.request.retry_count': 0,
            });
        }
    });

    test('request attributes are empty when the argument is not a crawling context', () => {
        const method = requestHandlingInstrumentationMethods.find((m) => m.methodName === 'runRequestHandler')!;

        // oxlint-disable-next-line no-unsafe-function-type
        expect((method.spanOptions as Function)(undefined)).toEqual({ attributes: {} });
    });
});

/**
 * `@opentelemetry/instrumentation` decides whether to patch a module with
 * `semver.satisfies(moduleVersion, supportedVersion, { includePrerelease })` and silently leaves the module alone when
 * that is false, so this reads both inputs off the definitions the instrumentation actually produces rather than
 * restating the literal. Crawlee v4 is published exclusively under prerelease tags, which a caret range never matches.
 */
describe('supported Crawlee versions', () => {
    const definitions = () => (new CrawleeInstrumentation() as any).init() as any[];

    const isSupported = (definition: any, version: string) =>
        (definition.supportedVersions as string[]).some((range) =>
            satisfies(version, range, { includePrerelease: definition.includePrerelease }),
        );

    test('covers every instrumented module', () => {
        expect(
            definitions()
                .map((d) => d.name)
                .sort(),
        ).toEqual(['@crawlee/basic', '@crawlee/browser', '@crawlee/core', '@crawlee/http', '@crawlee/playwright']);
    });

    // The first two are the versions currently behind the `v4` and `rc` dist-tags.
    test.each(['4.0.0-beta.140', '4.0.0-rc.0', '4.0.0', '4.1.0', '4.1.0-beta.3', '4.9.9'])(
        'patches Crawlee %s',
        (version) => {
            for (const definition of definitions()) {
                expect(isSupported(definition, version), `${definition.name} rejected ${version}`).toBe(true);
            }
        },
    );

    test.each(['3.13.0', '5.0.0', '5.0.0-beta.0'])('leaves Crawlee %s alone', (version) => {
        for (const definition of definitions()) {
            expect(isSupported(definition, version), `${definition.name} accepted ${version}`).toBe(false);
        }
    });
});
