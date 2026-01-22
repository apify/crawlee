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
    /** The name of the span. */
    spanName?: string | ((this: any, ...args: unknown[]) => string);
    /** The attributes of the span. */
    spanOptions?: SpanOptions | ((this: any, ...args: unknown[]) => SpanOptions);
}
