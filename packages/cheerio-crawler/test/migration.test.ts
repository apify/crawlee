import type { Log } from '@apify/log';
import log from '@apify/log';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';
import { CheerioCrawler, RequestList } from '../src/index';

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
        testLogger = log.child({ prefix: 'CheerioCrawler' });
    });

    describe('handlePageFunction -> requestHandler', () => {
        it('should log when providing both handlePageFunction and requestHandler', () => {
            const oldHandler = () => {};
            const newHandler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            const crawler = new CheerioCrawler({
                requestList,
                log: testLogger,
                requestHandler: newHandler,
                handlePageFunction: oldHandler,
            });

            expect(warningSpy).toHaveBeenCalledWith<[string]>([
                `Both "requestHandler" and "handlePageFunction" were provided in the crawler options.`,
                `"handlePageFunction" has been renamed to "requestHandler", and will be removed in a future version.`,
                `As such, "requestHandler" will be used instead.`,
            ].join('\n'));

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['requestHandler']).toBe(newHandler);
        });

        it('should log when providing only the deprecated handlePageFunction', () => {
            const oldHandler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            const crawler = new CheerioCrawler({
                requestList,
                log: testLogger,
                handlePageFunction: oldHandler,
            });

            expect(warningSpy).toHaveBeenCalledWith<[string]>([
                `"handlePageFunction" has been renamed to "requestHandler", and will be removed in a future version.`,
                `The provided value will be used, but you should rename "handlePageFunction" to "requestHandler" in your crawler options.`,
            ].join('\n'));

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['requestHandler']).toBe(oldHandler);
        });

        it('should not log when providing only requestHandler', () => {
            const handler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            const crawler = new CheerioCrawler({
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

            const crawler = new CheerioCrawler({
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

            const crawler = new CheerioCrawler({
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

            const crawler = new CheerioCrawler({
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
});
