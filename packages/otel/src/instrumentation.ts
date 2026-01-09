import { context, type Exception, trace, type Tracer } from '@opentelemetry/api';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';

import { baseConfig, requestHandlingInstrumentationMethods } from './constants';
import type { ClassMethodPatchDefinition, ModuleDefinition } from './internal-types';
import type { CrawleeInstrumentationConfig } from './types';
import { buildModuleDefinitions, getCompatibleVersions, getPackageVersion, toOtelAttributeValue } from './utilities';

export class CrawleeInstrumentation extends InstrumentationBase<CrawleeInstrumentationConfig> {

  constructor(config: CrawleeInstrumentationConfig = {}) {
    super('@crawlee/otel', getPackageVersion(), { ...baseConfig, ...config });
  }

  public getTracer(): Tracer {
    return this.tracer;
  }

  protected init(): InstrumentationNodeModuleDefinition[] {
    const methodsToInstrument = [...this.getConfig().customInstrumentation!];
    if (this.getConfig().requestHandlingInstrumentation) {
      methodsToInstrument!.push(...requestHandlingInstrumentationMethods);
    }
    const moduleDefinitions = buildModuleDefinitions(methodsToInstrument);
    const definitions = this.instanciateModuleDefinitions(moduleDefinitions);

    if (this.getConfig().logInstrumentation) {
      definitions.push(new InstrumentationNodeModuleDefinition(
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
      ));
    }
    return definitions;
  }

  private instanciateModuleDefinitions(moduleDefinitions: ModuleDefinition[]): InstrumentationNodeModuleDefinition[] {
    return moduleDefinitions.map(definition => {
      return new InstrumentationNodeModuleDefinition(
        definition.moduleName,
        [getCompatibleVersions()],
        (moduleExports) => {
          for (const patch of definition.classMethodPatches) {
            this.ensureWrapped(moduleExports[patch.className].prototype, patch.methodName, this.applyClassMethodPatch(patch));
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

  private ensureWrapped(
    obj: any,
    methodName: string,
    wrapper: (original: any) => any,
  ) {
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }

  private applyClassMethodPatch(patch: ClassMethodPatchDefinition): (original: any) => any {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instrumentation = this;

    return function wrap(original: (...args: unknown[]) => any) {
      return async function wrapped(this: any, ...args: unknown[]) {

        const spanName = typeof patch.spanName === 'function' ? 
          patch.spanName(this, ...args) : 
            patch.spanName ?? 
              `${this.constructor.name}.${original.name}`;

        const spanAttributes = typeof patch.spanOptions === 'function' ? 
          patch.spanOptions(this, ...args) : patch.spanOptions ?? {};

        patch.onInvokeHook?.(this, args, instrumentation);

        return await instrumentation.tracer.startActiveSpan(spanName, spanAttributes, async (span) => {
          try {
            await patch.onSpanStartHook?.(span, args);
            const result = await original.apply(this, args);
            await patch.onSpanEndHook?.(span, args, result);
            return result;
          } catch (err) {
            span.recordException(err as Exception);
            throw err;
          } finally {
            span.end();
          }
        });
      };
    };
  }

  private _getLogPatch() {
    return function wrapLog(original: (message: string, ...args: unknown[]) => void) {
      return async function wrappedLog(this: any, level: any, message: string, data?: any, exception?: any) { // weak typing to avoid importing apify/log types or redefining them
        if (level <= this.getLevel()) {
          const span = trace.getSpan(context.active());
          if (span && span.isRecording()) {
              if (exception) {
                  span.recordException(exception);
              } else {
                  span.addEvent(message, {
                      'crawlee.log.level': level,
                      'crawlee.log.data': toOtelAttributeValue(data),
                  });
              }
          }
        }
        return original.apply(this, [level, message, data, exception]);
      };
    };
  }
}
