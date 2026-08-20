import type { Exception, Span, SpanOptions, Tracer } from '@opentelemetry/api';
import { diag, SpanStatusCode, trace } from '@opentelemetry/api';

import { PACKAGE_NAME } from './constants.js';
import { getPackageVersion } from './utilities.js';

/**
 * The tracer `CrawleeInstrumentation` hands over once it knows which provider it ended up with, so that manually
 * wrapped handlers share the instrumentation scope of the automatic spans.
 *
 * Module level state, because `wrapWithSpan` is called from user code that holds no reference to the instrumentation.
 */
let sharedTracer: Tracer | undefined;

/**
 * Points the exported {@link wrapWithSpan} at a tracer, or back at the global API when passed `undefined`.
 *
 * @internal
 */
export function setSharedTracer(tracer: Tracer | undefined): void {
    sharedTracer = tracer;
}

/**
 * Wraps a function with OpenTelemetry span instrumentation.
 *
 * `Args` and `Return` are separate generics so that the argument types flow through to the `spanName` and `spanOptions`
 * callbacks. They are inferred from the wrapped function, so annotate its parameters when assigning the result to an
 * option whose type is a union - `requestHandler` accepts both a router and a plain handler, and TypeScript cannot
 * infer parameter types through a union of function types:
 *
 * ```ts
 * requestHandler: wrapWithSpan(async ({ request }: CheerioCrawlingContext) => { ... })
 * ```
 *
 * Synchronous functions stay synchronous, asynchronous ones keep their span open until the returned promise settles.
 *
 * The wrapper forwards its own `this` to the wrapped function, so a method keeps working when wrapped. An arrow
 * function still ignores it, as arrow functions always take `this` from where they were defined.
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
        // Resolving the tracer lazily lets `CrawleeInstrumentation` hand over its tracer at any point. When no
        // instrumentation is registered, we fall back to the global API, which returns a tracer that either
        // delegates to the globally registered provider or is a no-op - so wrapping never fails on its own.
        const tracer = options?.tracer ?? sharedTracer ?? trace.getTracer(PACKAGE_NAME, getPackageVersion());
        const spanName = resolveSpanName(options?.spanName, fn.name || 'anonymous', this, args);
        const spanOptions = resolveSpanOptions(options?.spanOptions, this, args);

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

/** @internal Shared with `CrawleeInstrumentation`, which supplies a class qualified default. */
export function resolveSpanName<Args extends unknown[]>(
    spanName: string | ((...args: Args) => string) | undefined,
    fallback: string,
    thisArg: unknown,
    args: Args,
): string {
    if (typeof spanName === 'function') {
        return callSpanOption(spanName, fallback, thisArg, args, 'spanName');
    }
    return spanName ?? fallback;
}

/** @internal Shared with `CrawleeInstrumentation`, which merges its own attributes into the resolved options. */
export function resolveSpanOptions<Args extends unknown[]>(
    spanOptions: SpanOptions | ((...args: Args) => SpanOptions) | undefined,
    thisArg: unknown,
    args: Args,
): SpanOptions {
    if (typeof spanOptions === 'function') {
        return callSpanOption(spanOptions, {}, thisArg, args, 'spanOptions');
    }
    return spanOptions ?? {};
}

/**
 * Calls a `spanName` or `spanOptions` callback supplied by the caller.
 *
 * These run inside the call path of the wrapped function, so a mistake in one must not turn into a failure of the
 * function being instrumented - the span is created with the default instead.
 */
function callSpanOption<Args extends unknown[], Value>(
    callback: (...args: Args) => Value,
    fallback: Value,
    thisArg: unknown,
    args: Args,
    optionName: string,
): Value {
    try {
        return callback.apply(thisArg, args);
    } catch (err) {
        diag.warn(`The ${optionName} callback of a ${PACKAGE_NAME} span threw, using the default instead: ${err}`);
        return fallback;
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
