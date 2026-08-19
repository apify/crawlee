import type { SpanOptions } from '@opentelemetry/api';

export interface ModuleDefinition {
    moduleName: string;
    classMethodPatches: ClassMethodPatchDefinition[];
}

export interface ClassMethodPatchDefinition {
    /** The class name to patch. */
    className: string;
    /** The method name to patch. */
    methodName: string;
    /**
     * The name of the span. Defaults to `className.methodName`.
     *
     * When given a function, it is called with the arguments of the patched method, and `this` is the instance the
     * method was called on. The arguments are `any` because they are whatever the patched method receives.
     */
    spanName?: string | ((this: any, ...args: any[]) => string);
    /** The attributes of the span. Follows the same calling convention as {@link ClassMethodPatchDefinition.spanName}. */
    spanOptions?: SpanOptions | ((this: any, ...args: any[]) => SpanOptions);
}

/**
 * The fields of a Crawlee `Request` this instrumentation reads.
 *
 * Deliberately structural rather than imported from `@crawlee/core`: the instrumented Crawlee version is resolved at
 * runtime and may not be the one this package was compiled against, so every field is treated as optional.
 */
export interface RequestLike {
    id?: string;
    url?: string;
    method?: string;
    retryCount?: number;
}

/** The part of a Crawlee crawling context this instrumentation reads. */
export interface CrawlingContextLike {
    request?: RequestLike;
}

/** One of the logging methods `BaseCrawleeLogger` provides, and how to read a log record out of a call to it. */
export interface LoggerMethodDefinition {
    /** The method on `BaseCrawleeLogger.prototype` to patch. */
    methodName: string;
    /** The Crawlee log level this method logs at. */
    level: number;
    /** Pulls the message and the structured data out of the call arguments, which differ per method. */
    read: (args: unknown[]) => { message: string; data?: Record<string, unknown> };
}
