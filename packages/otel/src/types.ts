import type { SpanOptions } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface CrawleeInstrumentationConfig extends InstrumentationConfig {
    requestHandlingInstrumentation?: boolean;
    logInstrumentation?: boolean;
    customInstrumentation?: ClassMethodToInstrument[];
}

/** One class method to wrap in a span, and the module that has to be loaded for it to exist. */
export interface ClassMethodToInstrument {
    /** The Crawlee package the class is exported from, for example `@crawlee/basic`. */
    moduleName: string;
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
    /** The attributes of the span. Follows the same calling convention as {@link ClassMethodToInstrument.spanName}. */
    spanOptions?: SpanOptions | ((this: any, ...args: any[]) => SpanOptions);
}
