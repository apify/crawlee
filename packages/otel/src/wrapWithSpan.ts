import type { SpanOptions, Tracer } from '@opentelemetry/api';

export class SpanWrapper {
    static _instance: SpanWrapper;
    private _tracer: Tracer | undefined;

    public setTracer(tracer: Tracer): void {
        this._tracer = tracer;
    }

    public static getInstance(): SpanWrapper {
        if (!SpanWrapper._instance) {
            SpanWrapper._instance = new SpanWrapper();
        }
        return SpanWrapper._instance;
    }

    public wrapWithSpan<Args extends unknown[], Return>(
        fn: (...args: Args) => Return,
        options?: {
            spanName?: string | ((...args: Args) => string);
            spanOptions?: SpanOptions | ((...args: Args) => SpanOptions);
            tracer?: Tracer;
        },
    ): (...args: Args) => Return {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const instrumentation = this;
        return function (this: unknown, ...args: Args): Return {
            const tracer = options?.tracer ?? instrumentation._tracer;
            if (!tracer) {
                throw new Error('Tracer not set');
            }
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
export const wrapWithSpan = SpanWrapper.getInstance().wrapWithSpan.bind(SpanWrapper.getInstance());
