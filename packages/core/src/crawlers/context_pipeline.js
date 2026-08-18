import { ContextPipelineCleanupError, ContextPipelineInitializationError, ContextPipelineInterruptedError, RequestHandlerError, SessionError, } from '../errors.js';
import { serviceLocator } from '../service_locator.js';
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
export class ContextPipeline {
    /**
     * Creates a new empty context pipeline.
     *
     * @template TContextBase - The base context type for the pipeline
     * @returns A new ContextPipeline instance with no transformations
     */
    static create() {
        return new ContextPipelineImpl({ action: async (context) => context });
    }
}
/**
 * Implementation of the `ContextPipeline` logic. This hides implementation details such as the `middleware` and `parent`
 * properties from the `ContextPipeline` interface, making type checking more reliable.
 */
class ContextPipelineImpl extends ContextPipeline {
    #middleware;
    #parent;
    constructor(middleware, parent) {
        super();
        this.#middleware = middleware;
        this.#parent = parent;
    }
    /**
     * @inheritdoc
     */
    compose(middleware) {
        return new ContextPipelineImpl(middleware, this);
    }
    chain(other) {
        const otherMiddlewares = Array.from(other.middlewareChain()).reverse();
        let result = this;
        for (const middleware of otherMiddlewares) {
            result = result.compose(middleware);
        }
        return result;
    }
    *middlewareChain() {
        let step = this;
        while (step !== undefined) {
            yield step.#middleware;
            step = step.#parent;
        }
    }
    /**
     * @inheritdoc
     */
    async call(crawlingContext, finalContextConsumer) {
        const middlewares = Array.from(this.middlewareChain()).reverse();
        const cleanupStack = [];
        let consumerException;
        try {
            for (const { action, cleanup } of middlewares) {
                try {
                    const contextExtension = await action(crawlingContext);
                    const extensionNames = [
                        ...Object.getOwnPropertyNames(contextExtension),
                        ...Object.getOwnPropertySymbols(contextExtension),
                    ];
                    for (const key of extensionNames) {
                        try {
                            if (Object.getOwnPropertyDescriptor(crawlingContext, key)?.configurable !== false) {
                                Object.defineProperty(crawlingContext, key, Object.getOwnPropertyDescriptor(contextExtension, key));
                            }
                        }
                        catch (error) {
                            serviceLocator
                                .getLogger()
                                .debug(`Context pipeline failed to define property ${key.toString()}:`, error);
                        }
                    }
                    if (cleanup) {
                        cleanupStack.push(cleanup);
                    }
                }
                catch (exception) {
                    if (exception instanceof SessionError) {
                        throw exception; // Session errors are re-thrown as-is
                    }
                    if (exception instanceof ContextPipelineInterruptedError) {
                        throw exception;
                    }
                    throw new ContextPipelineInitializationError(exception);
                }
            }
            try {
                await finalContextConsumer(crawlingContext);
            }
            catch (exception) {
                if (exception instanceof SessionError) {
                    consumerException = exception;
                    throw exception; // Session errors are re-thrown as-is
                }
                consumerException = exception;
                throw new RequestHandlerError(exception);
            }
        }
        finally {
            try {
                for (const cleanup of cleanupStack.reverse()) {
                    await cleanup(crawlingContext, consumerException);
                }
            }
            catch (exception) {
                // eslint-disable-next-line no-unsafe-finally
                throw new ContextPipelineCleanupError(exception);
            }
        }
    }
}
