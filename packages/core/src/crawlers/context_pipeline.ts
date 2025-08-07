import {
    ContextPipelineCleanupError,
    ContextPipelineInitializationError,
    ContextPipelineInterruptedError,
    RequestHandlerError,
    SessionError,
} from '../errors.js';

/**
 * Represents a middleware step in the context pipeline.
 *
 * @template TCrawlingContext - The input context type for this middleware
 * @template TEnhancedCrawlingContext - The enhanced output context type
 */
interface ContextMiddleware<TCrawlingContext, TEnhancedCrawlingContext> {
    /** The main middleware function that enhances the context */
    action: (context: TCrawlingContext) => Promise<TEnhancedCrawlingContext>;
    /** Optional cleanup function called after the consumer finishes or fails */
    cleanup?: (context: TEnhancedCrawlingContext, error?: unknown) => Promise<void>;
}

/**
 * Encapsulates the logic of gradually enhancing the crawling context with additional information and utilities.
 *
 * The enhancement is done by a chain of middlewares that are added to the pipeline after its creation.
 * This class provides a type-safe way to build a pipeline of context transformations where each step
 * can enhance the context with additional properties or utilities.
 *
 * @template TContextBase - The base context type that serves as the starting point
 * @template TInitialCrawlingContext - The initial context type extending the base context
 * @template TCrawlingContext - The final context type after all middleware transformations
 */
export class ContextPipeline<
    TContextBase extends {},
    TInitialCrawlingContext extends TContextBase,
    TCrawlingContext extends TInitialCrawlingContext,
> {
    private constructor(
        private middleware: ContextMiddleware<TInitialCrawlingContext, TCrawlingContext>,
        private parent?: ContextPipeline<TContextBase, TContextBase, TInitialCrawlingContext>,
    ) {}

    /**
     * Creates a new empty context pipeline.
     *
     * @template TContextBase - The base context type for the pipeline
     * @returns A new ContextPipeline instance with no transformations
     */
    static create<TContextBase extends {}>() {
        return new ContextPipeline<TContextBase, TContextBase, TContextBase>({ action: async (context) => context });
    }

    /**
     * Adds a middleware to the pipeline, creating a new pipeline instance.
     *
     * This method provides a fluent interface for building context transformation pipelines.
     * Each middleware can enhance the context with additional properties or utilities.
     *
     * @template TEnhancedCrawlingContext - The enhanced context type produced by this middleware
     * @param middleware - The middleware to add to the pipeline
     * @returns A new ContextPipeline instance with the added middleware
     */
    compose<TEnhancedCrawlingContext extends TCrawlingContext>(
        middleware: ContextMiddleware<TCrawlingContext, TEnhancedCrawlingContext>,
    ): ContextPipeline<TContextBase, TCrawlingContext, TEnhancedCrawlingContext> {
        return new ContextPipeline<TContextBase, TCrawlingContext, TEnhancedCrawlingContext>(middleware, this as any);
    }

    private *middlewareChain() {
        let step: ContextPipeline<TContextBase, TContextBase, TContextBase> | undefined = this as any;

        while (step !== undefined) {
            yield step.middleware;
            step = step.parent;
        }
    }

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
    async call(
        crawlingContext: TContextBase,
        finalContextConsumer: (finalContext: TCrawlingContext) => Promise<unknown>,
    ): Promise<void> {
        const middlewares = Array.from(this.middlewareChain()).reverse();
        const cleanupStack = [];
        let enhancedContext = crawlingContext;
        let consumerException: unknown | undefined = undefined;

        try {
            for (const { action: enhance, cleanup } of middlewares) {
                try {
                    enhancedContext = await enhance(enhancedContext);
                    if (cleanup) {
                        cleanupStack.push(cleanup);
                    }
                } catch (exception: unknown) {
                    if (exception instanceof SessionError) {
                        throw exception; // Session errors are re-thrown as-is
                    }
                    if (exception instanceof ContextPipelineInterruptedError) {
                        throw exception;
                    }

                    throw new ContextPipelineInitializationError(exception, enhancedContext);
                }
            }

            try {
                await finalContextConsumer(enhancedContext as TCrawlingContext);
            } catch (exception: unknown) {
                if (exception instanceof SessionError) {
                    consumerException = exception;
                    throw exception; // Session errors are re-thrown as-is
                }
                consumerException = exception;
                throw new RequestHandlerError(exception, enhancedContext);
            }
        } finally {
            try {
                for (const cleanup of cleanupStack.reverse()) {
                    await cleanup(enhancedContext, consumerException);
                }
            } catch (exception: unknown) {
                throw new ContextPipelineCleanupError(exception, enhancedContext);
            }
        }
    }
}
