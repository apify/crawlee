import type { Exception, Span, SpanOptions, Tracer } from '@opentelemetry/api';
import { SpanStatusCode, trace } from '@opentelemetry/api';

import { PACKAGE_NAME } from './constants';
import { getPackageVersion } from './utilities';

export class SpanWrapper {
    private static _instance: SpanWrapper;
    private _tracer: Tracer | undefined;

    public setTracer(tracer: Tracer): void {
        this._tracer = tracer;
    }

    public static getInstance(): SpanWrapper {
        SpanWrapper._instance ??= new SpanWrapper();
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
            // Resolving the tracer lazily lets `CrawleeInstrumentation` hand over its tracer at any point. When no
            // instrumentation is registered, we fall back to the global API, which returns a tracer that either
            // delegates to the globally registered provider or is a no-op - so wrapping never fails on its own.
            const tracer =
                options?.tracer ?? instrumentation._tracer ?? trace.getTracer(PACKAGE_NAME, getPackageVersion());
            const spanName =
                typeof options?.spanName === 'function'
                    ? options.spanName.apply(this, args)
                    : (options?.spanName ?? (fn.name || 'anonymous'));
            const spanOptions =
                typeof options?.spanOptions === 'function'
                    ? options.spanOptions.apply(this, args)
                    : (options?.spanOptions ?? {});

            return tracer.startActiveSpan(spanName, spanOptions, (span): Return => {
                let result: Return;

                try {
                    result = fn.apply(this, args);
                } catch (err) {
                    recordError(span, err);
                    span.end();
                    throw err;
                }

                // Only defer ending the span when the wrapped function is actually asynchronous, so that wrapping
                // a synchronous function does not silently turn it into a promise-returning one.
                if (!isPromiseLike(result)) {
                    span.end();
                    return result;
                }

                return Promise.resolve(result).then(
                    (value) => {
                        span.end();
                        return value;
                    },
                    (err) => {
                        recordError(span, err);
                        span.end();
                        throw err;
                    },
                ) as Return;
            });
        };
    }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return typeof (value as PromiseLike<unknown> | undefined)?.then === 'function';
}

function recordError(span: Span, err: unknown): void {
    span.recordException(err as Exception);
    // Per the OpenTelemetry specification, instrumentation only sets the status on failure and leaves successful
    // spans `UNSET` - marking them `OK` would prevent consumers from overriding the status themselves.
    span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
    });
}

/**
 * Wraps a function with OpenTelemetry span instrumentation.
 * Uses separate Args/Return generics to enable TypeScript contextual typing -
 * the types flow from the expected handler type (e.g. requestHandler) to the callbacks.
 *
 * Synchronous functions stay synchronous, asynchronous ones keep their span open until the returned promise settles.
 *
 * Note: If the wrapped function is an arrow function, `this` binding will not be
 * propagated (arrow functions use lexical `this`). Use a regular function expression
 * if you need access to `this`.
 */
export const wrapWithSpan = SpanWrapper.getInstance().wrapWithSpan.bind(SpanWrapper.getInstance());
