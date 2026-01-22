import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';

import { apifyLogLevelMap, baseConfig, requestHandlingInstrumentationMethods } from './constants';
import type { ClassMethodPatchDefinition, ModuleDefinition } from './internal-types';
import type { CrawleeInstrumentationConfig } from './types';
import { buildModuleDefinitions, getCompatibleVersions, getPackageVersion, wrapWithSpan } from './utilities';

export class CrawleeInstrumentation extends InstrumentationBase<CrawleeInstrumentationConfig> {
    constructor(config: CrawleeInstrumentationConfig = {}) {
        const version = getPackageVersion();
        super('@crawlee/otel', version, { ...baseConfig, ...config });
    }

    protected init(): InstrumentationNodeModuleDefinition[] {
        const methodsToInstrument = [...this.getConfig().customInstrumentation!];
        if (this.getConfig().requestHandlingInstrumentation) {
            methodsToInstrument!.push(...requestHandlingInstrumentationMethods);
        }
        const moduleDefinitions = buildModuleDefinitions(methodsToInstrument);
        const definitions = this.instanciateModuleDefinitions(moduleDefinitions);

        if (this.getConfig().logInstrumentation) {
            definitions.push(
                new InstrumentationNodeModuleDefinition(
                    '@apify/log',
                    ['^2.5.0'],
                    (moduleExports) => {
                        this.ensureWrapped(moduleExports.Log.prototype, 'internal', this._getLogPatch());
                        return moduleExports;
                    },
                    (moduleExports) => {
                        this._unwrap(moduleExports.Log.prototype, 'internal');
                        return moduleExports;
                    },
                ),
            );
        }
        return definitions;
    }

    private instanciateModuleDefinitions(moduleDefinitions: ModuleDefinition[]): InstrumentationNodeModuleDefinition[] {
        return moduleDefinitions.map((definition) => {
            return new InstrumentationNodeModuleDefinition(
                definition.moduleName,
                [getCompatibleVersions()],
                (moduleExports) => {
                    for (const patch of definition.classMethodPatches) {
                        this.ensureWrapped(
                            moduleExports[patch.className].prototype,
                            patch.methodName,
                            this.applyClassMethodPatch(patch),
                        );
                    }
                    return moduleExports;
                },
                (moduleExports) => {
                    for (const patch of definition.classMethodPatches) {
                        this._unwrap(moduleExports[patch.className].prototype, patch.methodName);
                    }
                    return moduleExports;
                },
            );
        });
    }

    private ensureWrapped(obj: any, methodName: string, wrapper: (original: any) => any) {
        if (isWrapped(obj[methodName])) {
            this._unwrap(obj, methodName);
        }
        this._wrap(obj, methodName, wrapper);
    }

    private applyClassMethodPatch(patch: ClassMethodPatchDefinition): (original: any) => any {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const instrumentation = this;

        return function wrap(original: (...args: unknown[]) => any) {
            return wrapWithSpan(original, {
                spanName: patch.spanName,
                spanOptions: patch.spanOptions,
                tracer: instrumentation.tracer,
            });
        };
    }

    private _getLogPatch() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const instrumentation = this;

        return function wrapLog(original: (message: string, ...args: unknown[]) => void) {
            return async function wrappedLog(this: any, level: any, message: string, data?: any, exception?: any) {
                if (this.getLevel() >= level) {
                    instrumentation.logger.emit({
                        severityNumber: apifyLogLevelMap[level],
                        body: message,
                        attributes: { ...exception, ...data },
                    });
                }
                return original.apply(this, [level, message, data, exception]);
            };
        };
    }
}
