import type { Log } from '@apify/log';
import log from '@apify/log';
import { PuppeteerPlugin } from '@crawlee/browser-pool';
import puppeteer from 'puppeteer';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';
import { BrowserCrawler, RequestList } from '../src/index';

const localStorageEmulator = new MemoryStorageEmulator();

beforeEach(async () => {
    await localStorageEmulator.init();
});

afterAll(async () => {
    await localStorageEmulator.destroy();
});

const plugin = new PuppeteerPlugin(puppeteer);

describe('Moving from handleRequest* to requestHandler*', () => {
    let requestList: RequestList;
    let testLogger: Log;

    beforeEach(async () => {
        requestList = await RequestList.open(null, []);
        testLogger = log.child({ prefix: 'BrowserCrawler' });
    });

    describe('handlePageFunction -> requestHandler', () => {
        it('should log when providing both handlePageFunction and requestHandler', async () => {
            const oldHandler = () => {};
            const newHandler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            // @ts-expect-error -- Protected constructor
            const crawler = new BrowserCrawler({
                requestList,
                log: testLogger,
                browserPoolOptions: {
                    browserPlugins: [plugin],
                },
                requestHandler: newHandler,
                handlePageFunction: oldHandler,
            });

            expect(warningSpy).toHaveBeenCalledWith<[string]>([
                `Both "requestHandler" and "handlePageFunction" were provided in the crawler options.`,
                `"handlePageFunction" has been renamed to "requestHandler", and will be removed in a future version.`,
                `As such, "requestHandler" will be used instead.`,
            ].join('\n'));

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['userProvidedRequestHandler']).toBe(newHandler);

            await crawler.browserPool.destroy();
        });

        it('should log when providing only the deprecated handlePageFunction', async () => {
            const oldHandler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            // @ts-expect-error -- We are verifying the deprecation warning
            const crawler = new BrowserCrawler({
                requestList,
                log: testLogger,
                browserPoolOptions: {
                    browserPlugins: [plugin],
                },
                handlePageFunction: oldHandler,
            });

            expect(warningSpy).toHaveBeenCalledWith<[string]>([
                `"handlePageFunction" has been renamed to "requestHandler", and will be removed in a future version.`,
                `The provided value will be used, but you should rename "handlePageFunction" to "requestHandler" in your crawler options.`,
            ].join('\n'));

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['userProvidedRequestHandler']).toBe(oldHandler);

            await crawler.browserPool.destroy();
        });

        it('should not log when providing only requestHandler', async () => {
            const handler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            // @ts-expect-error -- Protected constructor
            const crawler = new BrowserCrawler({
                requestList,
                log: testLogger,
                browserPoolOptions: {
                    browserPlugins: [plugin],
                },
                requestHandler: handler,
            });

            expect(warningSpy).not.toHaveBeenCalled();

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['userProvidedRequestHandler']).toBe(handler);

            await crawler.browserPool.destroy();
        });
    });

    describe('handleFailedRequestFunction -> failedRequestHandler', () => {
        it('should log when providing both handleFailedRequestFunction and failedRequestHandler', async () => {
            const oldHandler = () => {};
            const newHandler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            // @ts-expect-error -- Protected constructor
            const crawler = new BrowserCrawler({
                requestList,
                log: testLogger,
                browserPoolOptions: {
                    browserPlugins: [plugin],
                },
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

            await crawler.browserPool.destroy();
        });

        it('should log when providing only the deprecated handleFailedRequestFunction', async () => {
            const oldHandler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            // @ts-expect-error -- Protected constructor
            const crawler = new BrowserCrawler({
                requestList,
                log: testLogger,
                browserPoolOptions: {
                    browserPlugins: [plugin],
                },
                requestHandler: () => {},
                handleFailedRequestFunction: oldHandler,
            });

            expect(warningSpy).toHaveBeenCalledWith<[string]>([
                `"handleFailedRequestFunction" has been renamed to "failedRequestHandler", and will be removed in a future version.`,
                `The provided value will be used, but you should rename "handleFailedRequestFunction" to "failedRequestHandler" in your crawler options.`,
            ].join('\n'));

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['failedRequestHandler']).toBe(oldHandler);

            await crawler.browserPool.destroy();
        });

        it('should not log when providing only failedRequestHandler', async () => {
            const handler = () => {};
            const warningSpy = jest.spyOn(testLogger, 'warning');

            // @ts-expect-error -- Protected constructor
            const crawler = new BrowserCrawler({
                requestList,
                log: testLogger,
                browserPoolOptions: {
                    browserPlugins: [plugin],
                },
                requestHandler: () => {},
                failedRequestHandler: handler,
            });

            expect(warningSpy).not.toHaveBeenCalled();

            // eslint-disable-next-line dot-notation -- accessing private property
            expect(crawler['failedRequestHandler']).toBe(handler);

            await crawler.browserPool.destroy();
        });
    });
});
