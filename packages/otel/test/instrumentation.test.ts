import { CrawleeInstrumentation } from '@crawlee/otel';

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

            const logDefinition = definitions.find((d: any) => d.name === '@apify/log');
            expect(logDefinition).toBeDefined();
        });

        test('excludes log instrumentation when disabled', () => {
            const instrumentation = new CrawleeInstrumentation({
                requestHandlingInstrumentation: false,
                logInstrumentation: false,
            });

            const definitions = (instrumentation as any).init();

            const logDefinition = definitions.find((d: any) => d.name === '@apify/log');
            expect(logDefinition).toBeUndefined();
        });

        test('combines default and custom instrumentation', () => {
            const customMethods = [
                {
                    moduleName: '@crawlee/basic',
                    className: 'BasicCrawler',
                    methodName: 'customMethod',
                    spanName: 'custom.span',
                },
            ];

            const instrumentation = new CrawleeInstrumentation({
                requestHandlingInstrumentation: true,
                logInstrumentation: false,
                customInstrumentation: customMethods,
            });

            const definitions = (instrumentation as any).init();

            // Should have definitions for basic, browser, and http modules
            expect(definitions.length).toBeGreaterThan(0);
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
        expect(methodNames).toContain('_runTaskFunction');
        expect(methodNames).toContain('_requestFunctionErrorHandler');
        expect(methodNames).toContain('_handleFailedRequestHandler');
        expect(methodNames).toContain('_executeHooks');
    });

    test('contains expected BrowserCrawler methods', () => {
        const browserMethods = requestHandlingInstrumentationMethods.filter(
            (m: { moduleName: string }) => m.moduleName === '@crawlee/browser',
        );

        expect(browserMethods.length).toBeGreaterThan(0);

        const methodNames = browserMethods.map((m: { methodName: any }) => m.methodName);
        expect(methodNames).toContain('_handleNavigation');
        expect(methodNames).toContain('_runRequestHandler');
    });

    test('contains expected HttpCrawler methods', () => {
        const httpMethods = requestHandlingInstrumentationMethods.filter(
            (m: { moduleName: string }) => m.moduleName === '@crawlee/http',
        );

        expect(httpMethods.length).toBeGreaterThan(0);

        const methodNames = httpMethods.map((m: { methodName: any }) => m.methodName);
        expect(methodNames).toContain('_handleNavigation');
        expect(methodNames).toContain('_runRequestHandler');
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

    test('runRequestHandler methods have spanOptions with request attributes', () => {
        const runRequestHandlerMethods = requestHandlingInstrumentationMethods.filter(
            (m: { methodName: string }) => m.methodName === '_runRequestHandler',
        );

        for (const method of runRequestHandlerMethods) {
            expect(method.spanOptions).toBeDefined();
            expect(typeof method.spanOptions).toBe('function');

            // Test the spanOptions function with mock context
            const mockContext = {
                request: {
                    id: 'test-id',
                    url: 'https://example.com',
                    method: 'GET',
                    retryCount: 0,
                },
            };

            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            const options = (method.spanOptions as Function)(mockContext);
            expect(options.attributes).toBeDefined();
            expect(options.attributes['crawlee.request.id']).toBe('test-id');
            expect(options.attributes['crawlee.request.url']).toBe('https://example.com');
            expect(options.attributes['crawlee.request.method']).toBe('GET');
            expect(options.attributes['crawlee.request.retry_count']).toBe(0);
        }
    });
});

