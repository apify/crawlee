import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

import type { ClassMethodPatchDefinition } from './internal-types.js';

export interface CrawleeInstrumentationConfig extends InstrumentationConfig {
    requestHandlingInstrumentation?: boolean;
    logInstrumentation?: boolean;
    customInstrumentation?: ClassMethodToInstrument[];
}

export interface ClassMethodToInstrument extends ClassMethodPatchDefinition {
    moduleName: string;
}
