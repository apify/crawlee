import * as basicModule from '@crawlee/basic';
import * as browserModule from '@crawlee/browser';
import * as coreModule from '@crawlee/core';
import * as httpModule from '@crawlee/http';
import * as playwrightModule from '@crawlee/playwright';

import { loggerMethods, requestHandlingInstrumentationMethods } from '../../packages/otel/src/constants.js';

/**
 * Asserts that every method the automatic instrumentation patches by name still exists on the real prototype.
 *
 * Most of them are TypeScript `private`, so renaming one is a routine refactor - and a rename is invisible at runtime:
 * the instrumentation reports the missing method through `diag`, which is a no-op unless the application installed a
 * diagnostic logger, and then carries on unpatched. The span or log record simply stops being recorded.
 *
 * This is the tripwire. It fails in the same pull request as the rename, and names the method that moved, so the
 * instrumented methods can stay private instead of being promoted to `protected` for the instrumentation's sake.
 */
const instrumentedModules: Record<string, Record<string, unknown>> = {
    '@crawlee/basic': basicModule,
    '@crawlee/browser': browserModule,
    '@crawlee/core': coreModule,
    '@crawlee/http': httpModule,
    '@crawlee/playwright': playwrightModule,
};

describe('the patched Crawlee methods still exist', () => {
    test.each(
        requestHandlingInstrumentationMethods.map(
            (method) => [method.moduleName, method.className, method.methodName] as const,
        ),
    )('%s exports %s with a %s method', (moduleName, className, methodName) => {
        const moduleExports = instrumentedModules[moduleName];
        expect(moduleExports, `${moduleName} is instrumented but not covered by this test`).toBeDefined();

        const patchedClass = moduleExports[className] as { prototype?: Record<string, unknown> } | undefined;
        expect(patchedClass?.prototype, `${moduleName} no longer exports ${className}`).toBeDefined();
        expect(typeof patchedClass!.prototype![methodName], `${className}.${methodName} is no longer a method`).toBe(
            'function',
        );
    });

    test.each(loggerMethods.map((method) => [method.methodName] as const))(
        '@crawlee/core exports BaseCrawleeLogger with a %s method',
        (methodName) => {
            const prototype = coreModule.BaseCrawleeLogger.prototype as unknown as Record<string, unknown>;
            expect(typeof prototype[methodName], `BaseCrawleeLogger.${methodName} is no longer a method`).toBe(
                'function',
            );
        },
    );
});
