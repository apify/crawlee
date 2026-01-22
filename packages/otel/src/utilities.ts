import { readFileSync } from 'node:fs';

import type { SpanOptions, Tracer } from '@opentelemetry/api';
import { diag, trace } from '@opentelemetry/api';

import type { ModuleDefinition } from './internal-types';
import type { ClassMethodToInstrument } from './types';

let packageFile: any;

export function getPackageJson() {
    if (!packageFile) {
        const packageFilePath = require.resolve(`@crawlee/otel/package.json`);
        packageFile = JSON.parse(readFileSync(packageFilePath, 'utf8'));
    }
    return packageFile;
}

export function getPackageVersion() {
    const packageJson = getPackageJson();
    return packageJson.version;
}

export function getCompatibleVersions() {
    return `^${getPackageVersion()}`;
}

export function buildModuleDefinitions(methodsToInstrument: ClassMethodToInstrument[]): ModuleDefinition[] {
    const definitions: ModuleDefinition[] = [];

    for (const method of methodsToInstrument) {
        let definition = definitions.find((d) => d.moduleName === method.moduleName);
        if (!definition) {
            if (!method.moduleName.startsWith('@crawlee/')) {
                diag.warn(`Module ${method.moduleName} is not a valid Crawlee module. Skipping.`);
                continue;
            }
            definition = {
                moduleName: method.moduleName,
                classMethodPatches: [],
            };
            definitions.push(definition);
        }
        if (
            !definition.classMethodPatches.find(
                (p) => p.className === method.className && p.methodName === method.methodName,
            )
        ) {
            definition.classMethodPatches.push({
                className: method.className,
                methodName: method.methodName,
                spanName: method.spanName,
                spanOptions: method.spanOptions,
            });
        } else {
            diag.warn(`Method ${method.className}.${method.methodName} is already instrumented. Skipping.`);
            continue;
        }
    }
    return definitions;
}

/**
 * Wraps a function with OpenTelemetry span instrumentation.
 * Uses separate Args/Return generics to enable TypeScript contextual typing -
 * the types flow from the expected handler type (e.g. requestHandler) to the callbacks.
 *
 * Note: If the wrapped function is an arrow function, `this` binding will not be
 * propagated (arrow functions use lexical `this`). Use a regular function expression
 * if you need access to `this`.
 */
export function wrapWithSpan<Args extends unknown[], Return>(
    fn: (...args: Args) => Return,
    options?: {
        spanName?: string | ((...args: Args) => string);
        spanOptions?: SpanOptions | ((...args: Args) => SpanOptions);
        tracer?: Tracer;
    },
): (...args: Args) => Return {
    return function (this: unknown, ...args: Args): Return {
        const tracer = options?.tracer ?? trace.getTracer('crawlee');
        const spanName =
            typeof options?.spanName === 'function'
                ? options.spanName.apply(this, args)
                : (options?.spanName ?? (fn.name || 'anonymous'));
        const spanOptions =
            typeof options?.spanOptions === 'function'
                ? options.spanOptions.apply(this, args)
                : (options?.spanOptions ?? {});

        return tracer.startActiveSpan(spanName, spanOptions, async (span) => {
            try {
                const result = await fn.apply(this, args);
                span.setStatus({ code: 1 }); // OK
                return result;
            } catch (err) {
                span.recordException(err as Error);
                span.setStatus({ code: 2 }); // ERROR
                throw err;
            } finally {
                span.end();
            }
        }) as Return;
    };
}
