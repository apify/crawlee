import type { Awaitable } from '@crawlee/types';

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
 * @template TCrawlingContextExtension - The enhanced output context type
 */
export interface ContextMiddleware<TCrawlingContext extends {}, TCrawlingContextExtension extends {}> {
    /** The main middleware function that enhances the context */
    action: (context: TCrawlingContext) => Promise<TCrawlingContextExtension>;
    /** Optional cleanup function called after the consumer finishes or fails */
    cleanup?: (context: TCrawlingContext & TCrawlingContextExtension, error?: unknown) => Promise<void>;
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
export abstract class ContextPipeline<TContextBase extends {}, TCrawlingContext extends TContextBase> {
    /**
     * Creates a new empty context pipeline.
     *
     * @template TContextBase - The base context type for the pipeline
     * @returns A new ContextPipeline instance with no transformations
     */
    static create<TContextBase extends {}>(): ContextPipeline<TContextBase, TContextBase> {
        return new ContextPipelineImpl<TContextBase, TContextBase>({ action: async (context) => context });
    }

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
    abstract compose<TCrawlingContextExtension extends {}>(
        middleware: ContextMiddleware<TCrawlingContext, TCrawlingContextExtension>,
    ): ContextPipeline<TContextBase, TCrawlingContext & TCrawlingContextExtension>;

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
    abstract call(
        crawlingContext: TContextBase,
        finalContextConsumer: (finalContext: TCrawlingContext) => Awaitable<unknown>,
    ): Promise<void>;
}

/**
 * Implementation of the `ContextPipeline` logic. This hides implementation details such as the `middleware` and `parent`
 * properties from the `ContextPipeline` interface, making type checking more reliable.
 */
class ContextPipelineImpl<TContextBase extends {}, TCrawlingContext extends TContextBase> extends ContextPipeline<
    TContextBase,
    TCrawlingContext
> {
    constructor(
        private middleware: ContextMiddleware<TContextBase, TCrawlingContext>,
        private parent?: ContextPipelineImpl<TContextBase, TContextBase>,
    ) {
        super();
    }

    /**
     * @inheritdoc
     */
    compose<TCrawlingContextExtension extends {}>(
        middleware: ContextMiddleware<TCrawlingContext, TCrawlingContextExtension>,
    ): ContextPipeline<TContextBase, TCrawlingContext & TCrawlingContextExtension> {
        return new ContextPipelineImpl<TContextBase, TCrawlingContext & TCrawlingContextExtension>(
            middleware as any,
            this as any,
        );
    }

    private *middlewareChain() {
        let step: ContextPipelineImpl<TContextBase, TContextBase> | undefined = this as any;

        while (step !== undefined) {
            yield step.middleware;
            step = step.parent;
        }
    }

    /**
     * @inheritdoc
     */
    async call(
        crawlingContext: TContextBase,
        finalContextConsumer: (finalContext: TCrawlingContext) => Promise<unknown>,
    ): Promise<void> {
        const middlewares = Array.from(this.middlewareChain()).reverse();
        const cleanupStack = [];
        let consumerException: unknown | undefined;

        try {
            for (const { action, cleanup } of middlewares) {
                try {
                    const contextExtension = await action(crawlingContext);
                    Object.defineProperties(crawlingContext, Object.getOwnPropertyDescriptors(contextExtension));

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

                    throw new ContextPipelineInitializationError(exception, crawlingContext);
                }
            }

            try {
                await finalContextConsumer(crawlingContext as TCrawlingContext);
            } catch (exception: unknown) {
                if (exception instanceof SessionError) {
                    consumerException = exception;
                    throw exception; // Session errors are re-thrown as-is
                }
                consumerException = exception;
                throw new RequestHandlerError(exception, crawlingContext);
            }
        } finally {
            try {
                for (const cleanup of cleanupStack.reverse()) {
                    await cleanup(crawlingContext, consumerException);
                }
            } catch (exception: unknown) {
                // eslint-disable-next-line no-unsafe-finally
                throw new ContextPipelineCleanupError(exception, crawlingContext);
            }
        }
    }
}
