import type { Log } from '@apify/log';
import log from '@apify/log';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';
import { BasicCrawler, RequestList } from '../src/index';

const localStorageEmulator = new MemoryStorageEmulator();

beforeEach(async () => {
    await localStorageEmulator.init();
});

afterAll(async () => {
    await localStorageEmulator.destroy();
});

describe('Moving from handleRequest* to requestHandler*', () => {
    let requestList: RequestList;
    let testLogger: Log;

    beforeEach(async () => {
        requestList = await RequestList.open(null, []);
        testLogger = log.child({ prefix: 'BasicCrawler' });
    });

    describe('handleRequestFunction -> requestHandler', () => {
        it('should log when providing both handleRequestFunction and requestHandler', () => {
            const oldHandler = () => {};
            const newHandler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                requestHandler: newHandler,
                handleRequestFunction: oldHandler,
            });

            expect(warningSpy).toHaveBeenCalledWith<[string]>([
                `Both "requestHandler" and "handleRequestFunction" were provided in the crawler options.`,
                `"handleRequestFunction" has been renamed to "requestHandler", and will be removed in a future version.`,
                `As such, "requestHandler" will be used instead.`,
            ].join('\n'));

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['requestHandler']).toBe(newHandler);
        });

        it('should log when providing only the deprecated handleRequestFunction', () => {
            const oldHandler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                handleRequestFunction: oldHandler,
            });

            expect(warningSpy).toHaveBeenCalledWith<[string]>([
                `"handleRequestFunction" has been renamed to "requestHandler", and will be removed in a future version.`,
                `The provided value will be used, but you should rename "handleRequestFunction" to "requestHandler" in your crawler options.`,
            ].join('\n'));

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['requestHandler']).toBe(oldHandler);
        });

        it('should not log when providing only requestHandler', () => {
            const handler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                requestHandler: handler,
            });

            expect(warningSpy).not.toHaveBeenCalled();

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['requestHandler']).toBe(handler);
        });
    });

    describe('handleFailedRequestFunction -> failedRequestHandler', () => {
        it('should log when providing both handleFailedRequestFunction and failedRequestHandler', () => {
            const oldHandler = () => {};
            const newHandler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                requestHandler: () => {},
                failedRequestHandler: newHandler,
                handleFailedRequestFunction: oldHandler,
            });

            expect(warningSpy).toHaveBeenCalledWith<[string]>([
                `Both "failedRequestHandler" and "handleFailedRequestFunction" were provided in the crawler options.`,
                `"handleFailedRequestFunction" has been renamed to "failedRequestHandler", and will be removed in a future version.`,
                `As such, "failedRequestHandler" will be used instead.`,
            ].join('\n'));

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['failedRequestHandler']).toBe(newHandler);
        });

        it('should log when providing only the deprecated handleFailedRequestFunction', () => {
            const oldHandler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                requestHandler: () => {},
                handleFailedRequestFunction: oldHandler,
            });

            expect(warningSpy).toHaveBeenCalledWith<[string]>([
                `"handleFailedRequestFunction" has been renamed to "failedRequestHandler", and will be removed in a future version.`,
                `The provided value will be used, but you should rename "handleFailedRequestFunction" to "failedRequestHandler" in your crawler options.`,
            ].join('\n'));

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['failedRequestHandler']).toBe(oldHandler);
        });

        it('should not log when providing only failedRequestHandler', () => {
            const handler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                requestHandler: () => {},
                failedRequestHandler: handler,
            });

            expect(warningSpy).not.toHaveBeenCalled();

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['failedRequestHandler']).toBe(handler);
        });
    });

    describe('handleRequestTimeoutSecs -> requestHandlerTimeoutSecs', () => {
        it('should log when providing both handleRequestTimeoutSecs and requestHandlerTimeoutSecs', () => {
            const warningSpy = jest.spyOn(testLogger, 'warning');

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                requestHandler: () => {},
                requestHandlerTimeoutSecs: 420,
                handleRequestTimeoutSecs: 69,
            });

            expect(warningSpy).toHaveBeenCalledWith<[string]>([
                `Both "requestHandlerTimeoutSecs" and "handleRequestTimeoutSecs" were provided in the crawler options.`,
                `"handleRequestTimeoutSecs" has been renamed to "requestHandlerTimeoutSecs", and will be removed in a future version.`,
                `As such, "requestHandlerTimeoutSecs" will be used instead.`,
            ].join('\n'));

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['requestHandlerTimeoutMillis']).toEqual(420_000);
        });

        it('should log when providing only the deprecated handleRequestTimeoutSecs', () => {
            const warningSpy = jest.spyOn(testLogger, 'warning');

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                requestHandler: () => {},
                handleRequestTimeoutSecs: 69,
            });

            expect(warningSpy).toHaveBeenCalledWith<[string]>([
                `"handleRequestTimeoutSecs" has been renamed to "requestHandlerTimeoutSecs", and will be removed in a future version.`,
                `The provided value will be used, but you should rename "handleRequestTimeoutSecs" to "requestHandlerTimeoutSecs" in your crawler options.`,
            ].join('\n'));

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['requestHandlerTimeoutMillis']).toEqual(69_000);
        });

        it('should not log when providing some or no number to requestHandlerTimeoutSecs', () => {
            const warningSpy = jest.spyOn(testLogger, 'warning');

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                requestHandler: () => {},
            });

            expect(warningSpy).not.toHaveBeenCalled();

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['requestHandlerTimeoutMillis']).toBe(60_000);

            const crawler2 = new BasicCrawler({
                requestList,
                log: testLogger,
                requestHandler: () => {},
                requestHandlerTimeoutSecs: 420,
            });

            expect(warningSpy).not.toHaveBeenCalled();

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler2['requestHandlerTimeoutMillis']).toBe(420_000);
        });
    });
});
