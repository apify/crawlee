import { PuppeteerPlugin } from '@crawlee/browser-pool';
import puppeteer from 'puppeteer';

import { MemoryStorageEmulator } from '../../../test/shared/MemoryStorageEmulator';
import { BrowserCrawler, RequestList } from '../src/index';

const localStorageEmulator = new MemoryStorageEmulator();
const plugin = new PuppeteerPlugin(puppeteer);

beforeEach(async () => {
    await localStorageEmulator.init();
});

afterAll(async () => {
    await localStorageEmulator.destroy();
});

describe('BrowserCrawler navigationTimeoutBackpressure', () => {
    test('enables and applies initial backpressure limits when proxy is configured', async () => {
        const requestList = await RequestList.open(null, []);
        const proxyConfiguration = {
            newUrl: vitest.fn(async () => 'http://proxy.example.com'),
            newProxyInfo: vitest.fn(async () => ({ url: 'http://proxy.example.com' })),
            isManInTheMiddle: false,
        } as any;

        // @ts-expect-error -- Protected constructor for abstract class test
        const crawler = new BrowserCrawler({
            requestList,
            browserPoolOptions: {
                browserPlugins: [plugin],
            },
            requestHandler: async () => {},
            maxConcurrency: 20,
            navigationTimeoutBackpressure: true,
            proxyConfiguration,
        });

        // eslint-disable-next-line dot-notation -- internal assertions
        expect(crawler['navigationTimeoutBackpressureEnabled']).toBe(true);
        // eslint-disable-next-line dot-notation -- internal assertions
        expect(crawler['navigationTimeoutBackpressureCap']).toBe(4);
        // eslint-disable-next-line dot-notation -- internal assertions
        expect(crawler['autoscaledPoolOptions'].maxConcurrency).toBe(4);
        // eslint-disable-next-line dot-notation -- internal assertions
        expect(crawler['autoscaledPoolOptions'].desiredConcurrency).toBe(2);

        await crawler.browserPool.destroy();
    });

    test('does not enable backpressure mode without proxy configuration', async () => {
        const requestList = await RequestList.open(null, []);

        // @ts-expect-error -- Protected constructor for abstract class test
        const crawler = new BrowserCrawler({
            requestList,
            browserPoolOptions: {
                browserPlugins: [plugin],
            },
            requestHandler: async () => {},
            maxConcurrency: 20,
            navigationTimeoutBackpressure: true,
        });

        // eslint-disable-next-line dot-notation -- internal assertions
        expect(crawler['navigationTimeoutBackpressureEnabled']).toBe(false);
        // eslint-disable-next-line dot-notation -- internal assertions
        expect(crawler['autoscaledPoolOptions'].maxConcurrency).toBe(20);

        await crawler.browserPool.destroy();
    });

    test('validates timeoutPenaltyFactor range', async () => {
        const requestList = await RequestList.open(null, []);
        const proxyConfiguration = {
            newUrl: vitest.fn(async () => 'http://proxy.example.com'),
            newProxyInfo: vitest.fn(async () => ({ url: 'http://proxy.example.com' })),
            isManInTheMiddle: false,
        } as any;

        expect(() => {
            // @ts-expect-error -- Protected constructor for abstract class test
            return new BrowserCrawler({
                requestList,
                browserPoolOptions: {
                    browserPlugins: [plugin],
                },
                requestHandler: async () => {},
                navigationTimeoutBackpressure: {
                    enabled: true,
                    timeoutPenaltyFactor: 1.2,
                },
                proxyConfiguration,
            });
        }).toThrow();
    });

    test('bounds timeout-penalized set size', async () => {
        const requestList = await RequestList.open(null, []);
        const proxyConfiguration = {
            newUrl: vitest.fn(async () => 'http://proxy.example.com'),
            newProxyInfo: vitest.fn(async () => ({ url: 'http://proxy.example.com' })),
            isManInTheMiddle: false,
        } as any;

        // @ts-expect-error -- Protected constructor for abstract class test
        const crawler = new BrowserCrawler({
            requestList,
            browserPoolOptions: {
                browserPlugins: [plugin],
            },
            requestHandler: async () => {},
            maxConcurrency: 20,
            navigationTimeoutBackpressure: {
                enabled: true,
                maxPenalizedRequests: 2,
                timeoutPenaltyCooldownMillis: 0,
            },
            proxyConfiguration,
        });

        // eslint-disable-next-line dot-notation -- internal setup for test
        crawler['autoscaledPool'] = {
            maxConcurrency: 4,
            desiredConcurrency: 4,
            currentConcurrency: 2,
        };

        // eslint-disable-next-line dot-notation -- protected/internal method for unit test
        crawler['_applyNavigationTimeoutBackpressureOnTimeout'](
            { request: { id: '1', url: 'https://example.com/1' } },
            60_000,
        );
        // eslint-disable-next-line dot-notation -- protected/internal method for unit test
        crawler['_applyNavigationTimeoutBackpressureOnTimeout'](
            { request: { id: '2', url: 'https://example.com/2' } },
            60_000,
        );
        // eslint-disable-next-line dot-notation -- protected/internal method for unit test
        crawler['_applyNavigationTimeoutBackpressureOnTimeout'](
            { request: { id: '3', url: 'https://example.com/3' } },
            60_000,
        );

        // eslint-disable-next-line dot-notation -- internal assertions
        expect(crawler['timeoutPenalizedRequests'].size).toBe(2);
        // eslint-disable-next-line dot-notation -- internal assertions
        expect(crawler['timeoutPenalizedRequests'].has('1')).toBe(false);

        await crawler.browserPool.destroy();
    });
});
