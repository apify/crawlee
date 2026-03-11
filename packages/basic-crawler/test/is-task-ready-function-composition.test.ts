import { MemoryStorageEmulator } from '../../../test/shared/MemoryStorageEmulator';
import { BasicCrawler, RequestList } from '../src/index';

const localStorageEmulator = new MemoryStorageEmulator();

beforeEach(async () => {
    await localStorageEmulator.init();
});

afterAll(async () => {
    await localStorageEmulator.destroy();
});

describe('BasicCrawler autoscaledPool isTaskReadyFunction composition', () => {
    test('does not call custom isTaskReadyFunction when default readiness is false', async () => {
        const customIsTaskReadyFunction = vitest.fn(async () => true);
        const defaultIsTaskReadyFunction = vitest.fn(async () => false);
        const requestList = await RequestList.open(null, []);
        const crawler = new BasicCrawler({
            requestList,
            requestHandler: async () => {},
            autoscaledPoolOptions: {
                isTaskReadyFunction: customIsTaskReadyFunction,
            },
        });

        // eslint-disable-next-line dot-notation -- testing internal composition behavior
        crawler['_isTaskReadyFunction'] = defaultIsTaskReadyFunction;

        // eslint-disable-next-line dot-notation -- protected init for test setup
        await crawler['_init']();
        try {
            // eslint-disable-next-line dot-notation -- reading internal autoscaled pool function
            const isTaskReady = await crawler.autoscaledPool!['isTaskReadyFunction']();
            expect(isTaskReady).toBe(false);
            expect(defaultIsTaskReadyFunction).toHaveBeenCalledTimes(1);
            expect(customIsTaskReadyFunction).not.toHaveBeenCalled();
        } finally {
            await crawler.teardown();
        }
    });

    test('calls custom isTaskReadyFunction after default readiness passes', async () => {
        const customIsTaskReadyFunction = vitest.fn(async () => false);
        const defaultIsTaskReadyFunction = vitest.fn(async () => true);
        const requestList = await RequestList.open(null, []);
        const crawler = new BasicCrawler({
            requestList,
            requestHandler: async () => {},
            autoscaledPoolOptions: {
                isTaskReadyFunction: customIsTaskReadyFunction,
            },
        });

        // eslint-disable-next-line dot-notation -- testing internal composition behavior
        crawler['_isTaskReadyFunction'] = defaultIsTaskReadyFunction;

        // eslint-disable-next-line dot-notation -- protected init for test setup
        await crawler['_init']();
        try {
            // eslint-disable-next-line dot-notation -- reading internal autoscaled pool function
            const isTaskReady = await crawler.autoscaledPool!['isTaskReadyFunction']();
            expect(isTaskReady).toBe(false);
            expect(defaultIsTaskReadyFunction).toHaveBeenCalledTimes(1);
            expect(customIsTaskReadyFunction).toHaveBeenCalledTimes(1);
        } finally {
            await crawler.teardown();
        }
    });
});
