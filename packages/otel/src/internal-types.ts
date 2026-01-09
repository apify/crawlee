import type { Span, SpanOptions } from '@opentelemetry/api';

import type { CrawleeInstrumentation } from './instrumentation';

export interface ModuleDefinition {
    moduleName: string;
    classMethodPatches: ClassMethodPatchDefinition[];
}

export interface ClassMethodPatchDefinition {
    /** The class name to patch. */
    className: string;
    /** The method name to patch. */
    methodName: string;
    /** A hook to run when the method is invoked and before the span is started. */
    onInvokeHook?: (self: any, args: unknown[], instrumentation: CrawleeInstrumentation) => void;
    /** A hook to run when the span starts. */
    onSpanStartHook?: (span: Span, args: unknown[]) => Promise<void>;
    /** A hook to run when the span ends. */
    onSpanEndHook?: (span: Span, args: unknown[], result: any) => Promise<void>;
    /** The name of the span. */
    spanName?: string | ((this: any, ...args: unknown[]) => string);
    /** The attributes of the span. */
    spanOptions?: SpanOptions | ((this: any, ...args: unknown[]) => SpanOptions);
}
