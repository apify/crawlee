export { CrawleeInstrumentation } from './instrumentation';
// `ClassMethodToInstrument` extends `ClassMethodPatchDefinition`, and the context types appear in the callbacks a
// consumer writes, so all of them have to be nameable when configuring `customInstrumentation`.
export type { ClassMethodPatchDefinition, CrawlingContextLike, RequestLike } from './internal-types';
export * from './types';
export { wrapWithSpan } from './wrapWithSpan';
