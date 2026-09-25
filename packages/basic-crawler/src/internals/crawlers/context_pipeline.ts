import { serviceLocator } from '@crawlee/core';
import type { Awaitable } from '@crawlee/types';

import { ContextPipelineCleanupError, ContextPipelineInitializationError, RequestHandlerError } from '../errors.js';

/**
 * Registers a callback that runs after the final context consumer finishes. Cleanups run in reverse registration
 * order and receive the same `error` as the `onError` parameter of {@apilink ContextPipeline.call}: `undefined` on
 * success, otherwise a {@apilink ContextPipelineInitializationError} (a middleware failed) or a
 * {@apilink RequestHandlerError} (the consumer failed), with the original in `cause`. A cleanup that throws fails the
 * whole call with a {@apilink ContextPipelineCleanupError}, which is critical.
 */
export type CleanupRegistrar = (cleanup: (error?: unknown) => Awaitable<void>) => void;

/**
 * A middleware step in the context pipeline: receives the context built so far and returns an extension that gets
 * merged into it. Anything that needs tearing down is registered via `onCleanup`.
 *
 * @template TCrawlingContext - The input context type for this middleware
 * @template TCrawlingContextExtension - The enhanced output context type
 */
export type ContextMiddleware<TCrawlingContext, TCrawlingContextExtension> = (
    context: TCrawlingContext,
    onCleanup: CleanupRegistrar,
) => Awaitable<TCrawlingContextExtension>;

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
export abstract class ContextPipeline<TContextBase, TCrawlingContext extends TContextBase> {
    /**
     * Creates a new empty context pipeline.
     *
     * @template TContextBase - The base context type for the pipeline
     * @returns A new ContextPipeline instance with no transformations
     */
    static create<TContextBase>(): ContextPipeline<TContextBase, TContextBase> {
        return new ContextPipelineImpl<TContextBase, TContextBase>(async (context) => context);
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
    abstract compose<TCrawlingContextExtension>(
        middleware: ContextMiddleware<TCrawlingContext, TCrawlingContextExtension>,
    ): ContextPipeline<TContextBase, TCrawlingContext & TCrawlingContextExtension>;

    /**
     * Chains another pipeline onto this one. The other pipeline's base context must match
     * this pipeline's output context. Returns a new pipeline that runs this pipeline's
     * middlewares first, then the other pipeline's middlewares.
     *
     * @template TFinalContext - The final context type after the chained pipeline's transformations
     * @param other - The pipeline to append after this one
     * @returns A new ContextPipeline combining both pipelines' middlewares
     */
    abstract chain<TFinalContext extends TCrawlingContext>(
        other: ContextPipeline<TCrawlingContext, TFinalContext>,
    ): ContextPipeline<TContextBase, TFinalContext>;

    /**
     * Executes the middleware pipeline and passes the final context to a consumer function.
     *
     * This method runs the crawling context through the entire middleware chain, enhancing it
     * at each step, and then passes the final enhanced context to the provided consumer function.
     * Proper cleanup is performed even if exceptions occur during processing.
     *
     * @param crawlingContext - The initial context to process through the pipeline
     * @param finalContextConsumer - The function that will receive the final enhanced context
     * @param onError - Receives a middleware failure wrapped in a {@apilink ContextPipelineInitializationError}, or a
     *   consumer failure wrapped in a {@apilink RequestHandlerError}, with the original in `cause`. After a middleware
     *   failure, the rest of the chain and the consumer are skipped. Runs before the cleanups, so it still sees
     *   whatever the middlewares set up.
     *
     * @throws {ContextPipelineCleanupError} When cleanup operations fail
     * @throws Whatever `onError` throws
     */
    abstract call(
        crawlingContext: TContextBase,
        finalContextConsumer: (finalContext: TCrawlingContext) => Awaitable<unknown>,
        onError: (error: unknown) => Awaitable<void>,
    ): Promise<void>;
}

/**
 * Implementation of the `ContextPipeline` logic. This hides implementation details such as the `middleware` and `parent`
 * properties from the `ContextPipeline` interface, making type checking more reliable.
 */
class ContextPipelineImpl<TContextBase, TCrawlingContext extends TContextBase> extends ContextPipeline<
    TContextBase,
    TCrawlingContext
> {
    readonly #middleware: ContextMiddleware<TContextBase, TCrawlingContext>;
    readonly #parent?: ContextPipelineImpl<TContextBase, TContextBase>;

    constructor(
        middleware: ContextMiddleware<TContextBase, TCrawlingContext>,
        parent?: ContextPipelineImpl<TContextBase, TContextBase>,
    ) {
        super();
        this.#middleware = middleware;
        this.#parent = parent;
    }

    /**
     * @inheritdoc
     */
    compose<TCrawlingContextExtension>(
        middleware: ContextMiddleware<TCrawlingContext, TCrawlingContextExtension>,
    ): ContextPipeline<TContextBase, TCrawlingContext & TCrawlingContextExtension> {
        return new ContextPipelineImpl<TContextBase, TCrawlingContext & TCrawlingContextExtension>(
            middleware as any,
            this as any,
        );
    }

    chain<TFinalContext extends TCrawlingContext>(
        other: ContextPipeline<TCrawlingContext, TFinalContext>,
    ): ContextPipeline<TContextBase, TFinalContext> {
        const otherMiddlewares = Array.from(
            (other as any).middlewareChain() as Iterable<ContextMiddleware<any, any>>,
        ).reverse();

        let result: ContextPipeline<TContextBase, any> = this as any;
        for (const middleware of otherMiddlewares) {
            result = result.compose(middleware as any);
        }

        return result as ContextPipeline<TContextBase, TFinalContext>;
    }

    private *middlewareChain() {
        let step: ContextPipelineImpl<TContextBase, TContextBase> | undefined = this as any;

        while (step !== undefined) {
            yield step.#middleware;
            step = step.#parent;
        }
    }

    /**
     * @inheritdoc
     */
    async call(
        crawlingContext: TContextBase,
        finalContextConsumer: (finalContext: TCrawlingContext) => Promise<unknown>,
        onError: (error: unknown) => Awaitable<void>,
    ): Promise<void> {
        const middlewares = Array.from(this.middlewareChain()).reverse();
        const cleanupStack: Parameters<CleanupRegistrar>[0][] = [];
        const onCleanup: CleanupRegistrar = (cleanup) => {
            cleanupStack.push(cleanup);
        };
        let failure: unknown;
        let consumerStarted = false;

        try {
            try {
                for (const middleware of middlewares) {
                    const contextExtension = await middleware(crawlingContext, onCleanup);

                    const extensionNames = [
                        ...Object.getOwnPropertyNames(contextExtension),
                        ...Object.getOwnPropertySymbols(contextExtension),
                    ];

                    for (const key of extensionNames) {
                        try {
                            if (Object.getOwnPropertyDescriptor(crawlingContext, key)?.configurable !== false) {
                                Object.defineProperty(
                                    crawlingContext,
                                    key,
                                    Object.getOwnPropertyDescriptor(contextExtension, key)!,
                                );
                            }
                        } catch (error: any) {
                            serviceLocator
                                .getLogger()
                                .debug(`Context pipeline failed to define property ${key.toString()}:`, error);
                        }
                    }
                }

                consumerStarted = true;
                await finalContextConsumer(crawlingContext as TCrawlingContext);
            } catch (exception: unknown) {
                failure = consumerStarted
                    ? new RequestHandlerError(exception)
                    : new ContextPipelineInitializationError(exception);
                await onError(failure);
            }
        } finally {
            try {
                for (const cleanup of cleanupStack.reverse()) {
                    await cleanup(failure);
                }
            } catch (exception: unknown) {
                // eslint-disable-next-line no-unsafe-finally
                throw new ContextPipelineCleanupError(exception);
            }
        }
    }
}
