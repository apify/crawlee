import { ContextPipeline, ContextPipelineCleanupError, RequestHandlerError } from '@crawlee/basic';
import { describe, expect, it, vi } from 'vitest';

const rethrow = (error: unknown) => {
    throw error;
};

describe('ContextPipeline', () => {
    it('should call middlewares in a sequence', async () => {
        const pipeline = ContextPipeline.create()
            .compose(async () => ({ a: 2, b: 1, c: [1] }))
            .compose(async (context) => ({ a: context.a * 2, c: [...context.c, 2] }));

        const consumer = vi.fn();
        await pipeline.call({}, consumer, rethrow);

        expect(consumer).toHaveBeenCalledWith({ a: 4, b: 1, c: [1, 2] });
    });

    it('should call cleanup routines in reverse order, with access to the middleware closure', async () => {
        const pipeline = ContextPipeline.create()
            .compose(async (_, onCleanup) => {
                const c: number[] = [];
                onCleanup(() => {
                    c.push(1);
                });
                return { c };
            })
            .compose(async (context, onCleanup) => {
                onCleanup(() => {
                    context.c.push(2);
                });
                return {};
            });

        const consumer = vi.fn();
        await pipeline.call({}, consumer, rethrow);

        expect(consumer).toHaveBeenCalledWith({ c: [2, 1] });
    });

    it('should hand initialization errors to onInitializationError before running cleanups', async () => {
        const initializationError = new Error('Pipeline initialization failed');
        const order: string[] = [];
        const thirdMiddleware = vi.fn();

        const pipeline = ContextPipeline.create()
            .compose(async (_, onCleanup) => {
                onCleanup(() => {
                    order.push('cleanup');
                });
                return {};
            })
            .compose(async () => {
                throw initializationError;
            })
            .compose(thirdMiddleware);

        const consumer = vi.fn();
        const onInitializationError = vi.fn(async (error: unknown) => {
            order.push('onInitializationError');
            expect(error).toBe(initializationError);
        });

        await pipeline.call({}, consumer, onInitializationError);

        expect(onInitializationError).toHaveBeenCalledOnce();
        expect(thirdMiddleware).not.toHaveBeenCalled();
        expect(consumer).not.toHaveBeenCalled();
        expect(order).toEqual(['onInitializationError', 'cleanup']);
    });

    it('should wrap errors in the final consumer', async () => {
        const consumerError = new Error('Request handler failed');
        const context = { a: 3 };

        const pipeline = ContextPipeline.create().compose(async () => ({ b: 4 }));

        const consumer = vi.fn().mockRejectedValue(consumerError);

        await expect(pipeline.call(context, consumer, rethrow)).rejects.toThrow(
            expect.objectContaining({
                cause: consumerError,
                constructor: RequestHandlerError,
            }),
        );

        expect(consumer).toHaveBeenCalledWith({ a: 3, b: 4 });
    });

    it('should pass the consumer error to cleanup routines', async () => {
        const consumerError = new Error('Request handler failed');
        const context = { a: 3 };
        const cleanup = vi.fn();

        const pipeline = ContextPipeline.create().compose(async (_, onCleanup) => {
            onCleanup(cleanup);
            return { b: 4 };
        });

        await expect(pipeline.call(context, vi.fn().mockRejectedValue(consumerError), rethrow)).rejects.toThrow();

        expect(cleanup).toHaveBeenCalledWith(consumerError);
    });

    it('should call cleanup routines without an error if the consumer succeeds', async () => {
        const cleanup = vi.fn();

        const pipeline = ContextPipeline.create().compose(async (_, onCleanup) => {
            onCleanup(cleanup);
            return {};
        });

        await pipeline.call({}, vi.fn(), rethrow);

        expect(cleanup).toHaveBeenCalledWith(undefined);
    });

    it('should wrap cleanup errors', async () => {
        const cleanupError = new Error('Pipeline cleanup failed');
        const context = { a: 3 };

        const pipeline = ContextPipeline.create().compose(async (_, onCleanup) => {
            onCleanup(async () => {
                throw cleanupError;
            });
            return { b: 4 };
        });

        const consumer = vi.fn();

        await expect(pipeline.call(context, consumer, rethrow)).rejects.toThrow(
            expect.objectContaining({
                cause: cleanupError,
                constructor: ContextPipelineCleanupError,
            }),
        );

        expect(consumer).toHaveBeenCalledWith({ a: 3, b: 4 });
    });

    it('should not override non-configurable properties on the context', async () => {
        const context = {} as Record<string, unknown>;
        Object.defineProperty(context, 'frozen', { value: 'original', configurable: false });

        const pipeline = ContextPipeline.create<typeof context>().compose(async () => ({
            frozen: 'overridden',
            other: 'new',
        }));

        const consumer = vi.fn();
        await pipeline.call(context, consumer, rethrow);

        expect(consumer).toHaveBeenCalledWith(expect.objectContaining({ frozen: 'original', other: 'new' }));
    });

    describe('chain', () => {
        it('should run middlewares from both pipelines in order', async () => {
            const first = ContextPipeline.create<{ a: number }>().compose(async (ctx) => ({ b: ctx.a + 1 }));
            const second = ContextPipeline.create<{ a: number; b: number }>().compose(async (ctx) => ({
                c: ctx.b * 2,
            }));

            const consumer = vi.fn();
            await first.chain(second).call({ a: 1 }, consumer, rethrow);

            expect(consumer).toHaveBeenCalledWith({ a: 1, b: 2, c: 4 });
        });

        it('should call cleanup routines from both pipelines', async () => {
            const order: string[] = [];

            const first = ContextPipeline.create<object>().compose(async (_, onCleanup) => {
                onCleanup(() => {
                    order.push('first');
                });
                return {};
            });
            const second = ContextPipeline.create<object>().compose(async (_, onCleanup) => {
                onCleanup(() => {
                    order.push('second');
                });
                return {};
            });

            await first.chain(second).call({}, vi.fn(), rethrow);

            expect(order).toEqual(['second', 'first']);
        });
    });
});
