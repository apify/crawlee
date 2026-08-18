import type { Awaitable } from '@crawlee/types';
/**
 * Represents a middleware step in the context pipeline.
 *
 * @template TCrawlingContext - The input context type for this middleware
 * @template TCrawlingContextExtension - The enhanced output context type
 */
export interface ContextMiddleware<TCrawlingContext, TCrawlingContextExtension> {
    /** The main middleware function that enhances the context */
    action: (context: TCrawlingContext) => Awaitable<TCrawlingContextExtension>;
    /** Optional cleanup function called after the consumer finishes or fails */
    cleanup?: (context: TCrawlingContext & TCrawlingContextExtension, error?: unknown) => Awaitable<void>;
}
/**
 * Encapsulates the logic of gradually enhancing the crawling context with additional information and utilities.
 *
 * The enhancement is done by a chain of middlewares that are added to the pipeline after its creation.
 * This class provides a type-safe way to build a pipeline of context transformations where each step
 * can enhance the context with additional properties or utilities.
 *
 * @template TContextBase - The base context type that serves as the starting point
 * @template TCrawlingContext - The final context type after all middleware transformations
 */
export declare abstract class ContextPipeline<TContextBase, TCrawlingContext extends TContextBase> {
    /**
     * Creates a new empty context pipeline.
     *
     * @template TContextBase - The base context type for the pipeline
     * @returns A new ContextPipeline instance with no transformations
     */
    static create<TContextBase>(): ContextPipeline<TContextBase, TContextBase>;
    /**
     * Adds a middleware to the pipeline, creating a new pipeline instance.
     *
     * This method provides a fluent interface for building context transformation pipelines.
     * Each middleware can enhance the context with additional properties or utilities.
     *
     * @template TCrawlingContextExtension - The enhanced context type produced by this middleware
     * @param middleware - The middleware to add to the pipeline
     * @returns A new ContextPipeline instance with the added middleware
     */
    abstract compose<TCrawlingContextExtension>(middleware: ContextMiddleware<TCrawlingContext, TCrawlingContextExtension>): ContextPipeline<TContextBase, TCrawlingContext & TCrawlingContextExtension>;
    /**
     * Chains another pipeline onto this one. The other pipeline's base context must match
     * this pipeline's output context. Returns a new pipeline that runs this pipeline's
     * middlewares first, then the other pipeline's middlewares.
     *
     * @template TFinalContext - The final context type after the chained pipeline's transformations
     * @param other - The pipeline to append after this one
     * @returns A new ContextPipeline combining both pipelines' middlewares
     */
    abstract chain<TFinalContext extends TCrawlingContext>(other: ContextPipeline<TCrawlingContext, TFinalContext>): ContextPipeline<TContextBase, TFinalContext>;
    /**
     * Executes the middleware pipeline and passes the final context to a consumer function.
     *
     * This method runs the crawling context through the entire middleware chain, enhancing it
     * at each step, and then passes the final enhanced context to the provided consumer function.
     * Proper cleanup is performed even if exceptions occur during processing.
     *
     * @param crawlingContext - The initial context to process through the pipeline
     * @param finalContextConsumer - The function that will receive the final enhanced context
     *
     * @throws {ContextPipelineInitializationError} When a middleware fails during initialization
     * @throws {ContextPipelineInterruptedError} When the pipeline is intentionally interrupted during initialization
     * @throws {RequestHandlerError} When the final context consumer throws an exception
     * @throws {ContextPipelineCleanupError} When cleanup operations fail
     * @throws {SessionError} Session errors are re-thrown as-is for special handling
     */
    abstract call(crawlingContext: TContextBase, finalContextConsumer: (finalContext: TCrawlingContext) => Awaitable<unknown>): Promise<void>;
}
