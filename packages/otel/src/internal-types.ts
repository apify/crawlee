import type { ClassMethodToInstrument } from './types.js';

/** The patches of one instrumented module, as produced by {@link buildModuleDefinitions}. */
export interface ModuleDefinition {
    moduleName: string;
    classMethodPatches: ClassMethodPatchDefinition[];
}

/**
 * A {@link ClassMethodToInstrument} that has already been grouped under its module, so the module name would be
 * redundant. Derived from the public type rather than restated, so the fields and their documentation have one home.
 */
export type ClassMethodPatchDefinition = Omit<ClassMethodToInstrument, 'moduleName'>;

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
