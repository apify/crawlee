import {
    ContextPipeline,
    ContextPipelineCleanupError,
    ContextPipelineInitializationError,
    ContextPipelineInterruptedError,
    RequestHandlerError,
} from '@crawlee/core';
import { describe, expect, it, vi } from 'vitest';

describe('ContextPipeline', () => {
    it('should call middlewares in a sequence', async () => {
        const pipeline = ContextPipeline.create()
            .compose({
                action: async () => ({ a: 2, b: 1, c: [1] }),
            })
            .compose({
                action: async (context) => ({ a: context.a * 2, c: [...context.c, 2] }),
            });

        const consumer = vi.fn();
        await pipeline.call({}, consumer);

        expect(consumer).toHaveBeenCalledWith({ a: 4, b: 1, c: [1, 2] });
    });

    it('should call cleanup routines', async () => {
        const pipeline = ContextPipeline.create()
            .compose({
                action: async () => ({ c: [] as number[] }),
                cleanup: async (context) => {
                    context.c.push(1);
                },
            })
            .compose({
                action: async () => ({}),
                cleanup: async (context) => {
                    context.c.push(2);
                },
            });

        const consumer = vi.fn();
        await pipeline.call({}, consumer);

        expect(consumer).toHaveBeenCalledWith({ c: [2, 1] });
    });

    it('should allow interrupting the pipeline in middlewares', async () => {
        const context = { a: 3 };

        const firstAction = vi.fn().mockResolvedValue({});
        const firstCleanup = vi.fn();
        const secondAction = vi.fn().mockRejectedValue(new ContextPipelineInterruptedError());
        const secondCleanup = vi.fn();
        const thirdAction = vi.fn().mockResolvedValue({});
        const thirdCleanup = vi.fn();

        const pipeline = ContextPipeline.create()
            .compose({ action: firstAction, cleanup: firstCleanup })
            .compose({
                action: secondAction,
                cleanup: secondCleanup,
            })
            .compose({ action: thirdAction, cleanup: thirdCleanup });

        const consumer = vi.fn();

        await expect(pipeline.call(context, consumer)).rejects.toThrow(ContextPipelineInterruptedError);

        expect(firstAction).toHaveBeenCalled();
        expect(firstCleanup).toHaveBeenCalled();
        expect(secondAction).toHaveBeenCalled();
        expect(secondCleanup).not.toHaveBeenCalled();
        expect(thirdAction).not.toHaveBeenCalled();
        expect(thirdCleanup).not.toHaveBeenCalled();
        expect(consumer).not.toHaveBeenCalled();
    });

    it('should wrap pipeline initialization errors', async () => {
        const initializationError = new Error('Pipeline initialization failed');
        const context = { a: 3 };
        const secondMiddleware = vi.fn();

        const pipeline = ContextPipeline.create()
            .compose({
                action: async () => {
                    throw initializationError;
                },
            })
            .compose({ action: secondMiddleware });

        const consumer = vi.fn();

        await expect(pipeline.call(context, consumer)).rejects.toThrow(
            expect.objectContaining({
                error: initializationError,
                crawlingContext: context,
                constructor: ContextPipelineInitializationError,
            }),
        );

        expect(consumer).not.toHaveBeenCalled();
        expect(secondMiddleware).not.toHaveBeenCalled();
    });

    it('should wrap errors in the final consumer', async () => {
        const consumerError = new Error('Request handler failed');
        const context = { a: 3 };

        const pipeline = ContextPipeline.create().compose({
            action: async () => ({
                b: 4,
            }),
        });

        const consumer = vi.fn().mockRejectedValue(consumerError);

        await expect(pipeline.call(context, consumer)).rejects.toThrow(
            expect.objectContaining({
                error: consumerError,
                crawlingContext: { a: 3, b: 4 },
                constructor: RequestHandlerError,
            }),
        );

        expect(consumer).toHaveBeenCalledWith({ a: 3, b: 4 });
    });

    it('should call cleanup routines even if the final consumer fails', async () => {
        const consumerError = new Error('Request handler failed');
        const context = { a: 3 };
        const cleanup = vi.fn();

        const pipeline = ContextPipeline.create().compose({
            action: async () => ({
                b: 4,
            }),
            cleanup,
        });

        await expect(pipeline.call(context, vi.fn().mockRejectedValue(consumerError))).rejects.toThrow();

        expect(cleanup).toHaveBeenCalledWith({ a: 3, b: 4 }, consumerError);
    });

    it('should wrap cleanup errors', async () => {
        const cleanupError = new Error('Pipeline cleanup failed');
        const context = { a: 3 };

        const pipeline = ContextPipeline.create().compose({
            action: async () => ({
                b: 4,
            }),
            cleanup: async () => {
                throw cleanupError;
            },
        });

        const consumer = vi.fn();

        await expect(pipeline.call(context, consumer)).rejects.toThrow(
            expect.objectContaining({
                error: cleanupError,
                crawlingContext: { a: 3, b: 4 },
                constructor: ContextPipelineCleanupError,
            }),
        );

        expect(consumer).toHaveBeenCalledWith({ a: 3, b: 4 });
    });
});
