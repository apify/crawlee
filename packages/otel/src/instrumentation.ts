// oxlint-disable no-underscore-dangle -- `_wrap`, `_unwrap` and `_diag` are inherited from `InstrumentationBase`.
import type { SpanOptions, TracerProvider } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import type { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import { ATTR_CODE_FUNCTION_NAME } from '@opentelemetry/semantic-conventions';

import {
    apifyLogLevelMap,
    apifyLogLevelNameMap,
    baseConfig,
    loggerMethods,
    PACKAGE_NAME,
    requestHandlingInstrumentationMethods,
    SUPPORTED_CRAWLEE_VERSIONS,
} from './constants.js';
import type { ClassMethodPatchDefinition, LoggerMethodDefinition, ModuleDefinition } from './internal-types.js';
import type { CrawleeInstrumentationConfig } from './types.js';
import { buildLogAttributes, buildModuleDefinitions, getPackageVersion } from './utilities.js';
import { resolveSpanName, resolveSpanOptions, setSharedTracer, wrapWithSpan } from './wrapWithSpan.js';

/**
 * Builds a module definition for one of the instrumented Crawlee packages.
 *
 * `InstrumentationNodeModuleDefinition` does not take `includePrerelease` through its constructor, but
 * `InstrumentationBase` reads it off the definition when it decides whether to patch a resolved module version, so it
 * is set here. Without it, {@link SUPPORTED_CRAWLEE_VERSIONS} would only cover prereleases of `4.0.0` and every
 * `4.x.0-beta` would go uninstrumented.
 */
function crawleeModuleDefinition(
    moduleName: string,
    patch: (moduleExports: any) => any,
    unpatch: (moduleExports: any) => any,
): InstrumentationModuleDefinition {
    const definition: InstrumentationModuleDefinition = new InstrumentationNodeModuleDefinition(
        moduleName,
        SUPPORTED_CRAWLEE_VERSIONS,
        patch,
        unpatch,
    );
    definition.includePrerelease = true;
    return definition;
}

export class CrawleeInstrumentation extends InstrumentationBase<CrawleeInstrumentationConfig> {
    constructor(config: CrawleeInstrumentationConfig = {}) {
        // Each flag is resolved on its own rather than by spreading `config` over `baseConfig`: a spread lets an
        // explicit `undefined` - which is what `{ logInstrumentation: options.logs }` produces when `options.logs`
        // is not set - overwrite the default with nothing and quietly disable the feature.
        super(PACKAGE_NAME, getPackageVersion(), {
            ...config,
            enabled: config.enabled ?? baseConfig.enabled,
            requestHandlingInstrumentation:
                config.requestHandlingInstrumentation ?? baseConfig.requestHandlingInstrumentation,
            logInstrumentation: config.logInstrumentation ?? baseConfig.logInstrumentation,
            customInstrumentation: config.customInstrumentation ?? baseConfig.customInstrumentation,
        });
    }

    /**
     * Shares the tracer with the exported `wrapWithSpan` helper, so that manually wrapped handlers end up in the same
     * instrumentation scope as the automatic spans.
     *
     * This has to happen here rather than in the constructor. The constructor can only reach the tracer of the global
     * API, and that is not necessarily the one this instrumentation ends up using - a `tracerProvider` passed to
     * `registerInstrumentations` is never registered globally, and a duplicated `@opentelemetry/api` in the dependency
     * tree has its own global. Handing over a tracer from the wrong provider silences every span, including the
     * automatic ones, and because it is not `undefined` it also shadows the fallback in `wrapWithSpan`.
     */
    public override setTracerProvider(tracerProvider: TracerProvider): void {
        super.setTracerProvider(tracerProvider);
        setSharedTracer(this.tracer);
    }

    protected init(): InstrumentationModuleDefinition[] {
        const methodsToInstrument = [...(this.getConfig().customInstrumentation ?? [])];
        if (this.getConfig().requestHandlingInstrumentation) {
            methodsToInstrument.push(...requestHandlingInstrumentationMethods);
        }
        const moduleDefinitions = buildModuleDefinitions(methodsToInstrument);
        const definitions = this.instantiateModuleDefinitions(moduleDefinitions);

        if (this.getConfig().logInstrumentation) {
            definitions.push(
                crawleeModuleDefinition(
                    '@crawlee/core',
                    (moduleExports) => {
                        for (const method of loggerMethods) {
                            const prototype = this.getPrototype(
                                moduleExports,
                                '@crawlee/core',
                                'BaseCrawleeLogger',
                                method.methodName,
                            );
                            if (prototype) {
                                this._wrap(prototype, method.methodName, this.getLogPatch(method));
                            }
                        }
                        return moduleExports;
                    },
                    (moduleExports) => {
                        for (const method of loggerMethods) {
                            this.unwrapIfWrapped(moduleExports?.BaseCrawleeLogger?.prototype, method.methodName);
                        }
                        return moduleExports;
                    },
                ),
            );
        }
        return definitions;
    }

    private instantiateModuleDefinitions(moduleDefinitions: ModuleDefinition[]): InstrumentationModuleDefinition[] {
        return moduleDefinitions.map((definition) => {
            return crawleeModuleDefinition(
                definition.moduleName,
                (moduleExports) => {
                    for (const patch of definition.classMethodPatches) {
                        const prototype = this.getPrototype(
                            moduleExports,
                            definition.moduleName,
                            patch.className,
                            patch.methodName,
                        );
                        if (prototype) {
                            this._wrap(prototype, patch.methodName, this.applyClassMethodPatch(patch));
                        }
                    }
                    return moduleExports;
                },
                (moduleExports) => {
                    for (const patch of definition.classMethodPatches) {
                        this.unwrapIfWrapped(moduleExports?.[patch.className]?.prototype, patch.methodName);
                    }
                    return moduleExports;
                },
            );
        });
    }

    /**
     * Resolves the prototype holding the method to patch, warning instead of throwing when the class or the method
     * is not there - a missing internal method must not break loading of the instrumented module.
     */
    private getPrototype(moduleExports: any, moduleName: string, className: string, methodName: string) {
        const prototype = moduleExports?.[className]?.prototype;

        if (typeof prototype?.[methodName] !== 'function') {
            this._diag.warn(
                `Skipping instrumentation of ${moduleName}: ${className}.${methodName} was not found. ` +
                    `The installed version of ${moduleName} is probably not supported by ${PACKAGE_NAME}.`,
            );
            return undefined;
        }

        return prototype;
    }

    /** Mirrors {@link getPrototype}: only methods that were actually patched are restored. */
    private unwrapIfWrapped(prototype: any, methodName: string) {
        if (prototype && isWrapped(prototype[methodName])) {
            this._unwrap(prototype, methodName);
        }
    }

    private applyClassMethodPatch(patch: ClassMethodPatchDefinition): (original: any) => any {
        const { spanName, spanOptions } = patch;
        const qualifiedName = `${patch.className}.${patch.methodName}`;
        const codeAttributes = { [ATTR_CODE_FUNCTION_NAME]: qualifiedName };

        // Both options are resolved through the guarded helpers, so that a throwing callback costs only what the
        // caller supplied - the span itself, its name and the attributes added here all survive.
        return function wrap(original: (...args: unknown[]) => any) {
            return wrapWithSpan(original, {
                spanName(this: unknown, ...args: unknown[]): string {
                    return resolveSpanName(spanName, qualifiedName, this, args);
                },
                spanOptions(this: unknown, ...args: unknown[]): SpanOptions {
                    const resolved = resolveSpanOptions(spanOptions, this, args);
                    return { ...resolved, attributes: { ...codeAttributes, ...resolved.attributes } };
                },
            });
        };
    }

    private getLogPatch(method: LoggerMethodDefinition) {
        // oxlint-disable-next-line no-this-alias
        const instrumentation = this;

        return function wrapLog(original: (...args: any[]) => void) {
            return function wrappedLog(this: unknown, ...args: any[]): void {
                // The application's own logging runs first and its outcome is never affected by the forwarding,
                // which matters most where Crawlee logs from inside a `catch` - `handleFailedRequestHandler`.
                // These methods are synchronous and return void, so keep them that way.
                try {
                    original.apply(this, args);
                } finally {
                    instrumentation.forwardLogRecord(method, args);
                }
            };
        };
    }

    /**
     * Emits one Crawlee log call as an OpenTelemetry log record.
     *
     * Everything here - reading the arguments, stringifying the message, handing the record to the SDK - runs inside
     * the application's own call to `log.info()` and friends, so a failure anywhere in it is reported and dropped
     * rather than raised.
     */
    private forwardLogRecord(method: LoggerMethodDefinition, args: unknown[]): void {
        try {
            const { message, data } = method.read(args);

            // Crawlee leaves level filtering to the logging library, so everything is forwarded and the
            // OpenTelemetry pipeline decides what to keep.
            this.logger.emit({
                severityNumber: apifyLogLevelMap[method.level] ?? SeverityNumber.UNSPECIFIED,
                severityText: apifyLogLevelNameMap[method.level],
                body: message,
                attributes: buildLogAttributes(data),
            });
        } catch (err) {
            this._diag.warn(`Failed to forward a Crawlee log record to OpenTelemetry: ${err}`);
        }
    }
}
