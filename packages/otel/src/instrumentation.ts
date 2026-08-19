import type { SpanOptions, TracerProvider } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import { ATTR_CODE_FUNCTION_NAME } from '@opentelemetry/semantic-conventions';

import {
    apifyLogLevelMap,
    apifyLogLevelNameMap,
    baseConfig,
    PACKAGE_NAME,
    requestHandlingInstrumentationMethods,
    SUPPORTED_APIFY_LOG_VERSIONS,
    SUPPORTED_CRAWLEE_VERSIONS,
} from './constants';
import type { ApifyLogLike, ClassMethodPatchDefinition, ModuleDefinition } from './internal-types';
import type { CrawleeInstrumentationConfig } from './types';
import { buildLogAttributes, buildModuleDefinitions, getPackageVersion } from './utilities';
import { SpanWrapper, wrapWithSpan } from './wrapWithSpan';

export class CrawleeInstrumentation extends InstrumentationBase<CrawleeInstrumentationConfig> {
    constructor(config: CrawleeInstrumentationConfig = {}) {
        super(PACKAGE_NAME, getPackageVersion(), { ...baseConfig, ...config });
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
        SpanWrapper.getInstance().setTracer(this.tracer);
    }

    protected init(): InstrumentationNodeModuleDefinition[] {
        const methodsToInstrument = [...(this.getConfig().customInstrumentation ?? [])];
        if (this.getConfig().requestHandlingInstrumentation) {
            methodsToInstrument.push(...requestHandlingInstrumentationMethods);
        }
        const moduleDefinitions = buildModuleDefinitions(methodsToInstrument);
        const definitions = this.instantiateModuleDefinitions(moduleDefinitions);

        if (this.getConfig().logInstrumentation) {
            definitions.push(
                new InstrumentationNodeModuleDefinition(
                    '@apify/log',
                    SUPPORTED_APIFY_LOG_VERSIONS,
                    (moduleExports) => {
                        const prototype = this.getPrototype(moduleExports, '@apify/log', 'Log', 'internal');
                        if (prototype) {
                            this._wrap(prototype, 'internal', this._getLogPatch());
                        }
                        return moduleExports;
                    },
                    (moduleExports) => {
                        this.unwrapIfWrapped(moduleExports?.Log?.prototype, 'internal');
                        return moduleExports;
                    },
                ),
            );
        }
        return definitions;
    }

    private instantiateModuleDefinitions(moduleDefinitions: ModuleDefinition[]): InstrumentationNodeModuleDefinition[] {
        return moduleDefinitions.map((definition) => {
            return new InstrumentationNodeModuleDefinition(
                definition.moduleName,
                SUPPORTED_CRAWLEE_VERSIONS,
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
        const codeAttributes = { [ATTR_CODE_FUNCTION_NAME]: `${patch.className}.${patch.methodName}` };

        return function wrap(original: (...args: unknown[]) => any) {
            return wrapWithSpan(original, {
                spanName: spanName ?? `${patch.className}.${patch.methodName}`,
                spanOptions(this: unknown, ...args: unknown[]): SpanOptions {
                    const resolved = typeof spanOptions === 'function' ? spanOptions.apply(this, args) : spanOptions;
                    return { ...resolved, attributes: { ...codeAttributes, ...resolved?.attributes } };
                },
            });
        };
    }

    private _getLogPatch() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const instrumentation = this;

        return function wrapLog(original: ApifyLogLike['internal']): ApifyLogLike['internal'] {
            return function wrappedLog(
                this: ApifyLogLike,
                level: number,
                message: string,
                data?: unknown,
                exception?: unknown,
            ): void {
                // `Log.internal` drops anything below the configured level, so mirror that check before emitting.
                if (this.getLevel() >= level) {
                    instrumentation.logger.emit({
                        severityNumber: apifyLogLevelMap[level] ?? SeverityNumber.UNSPECIFIED,
                        severityText: apifyLogLevelNameMap[level],
                        body: message,
                        attributes: buildLogAttributes(data, exception),
                    });
                }
                // `internal` is synchronous and returns void - keep it that way.
                original.call(this, level, message, data, exception);
            };
        };
    }
}
