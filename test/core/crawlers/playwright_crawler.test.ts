import type { Server } from 'http';
import type { AddressInfo } from 'net';
import os from 'os';

import log from '@apify/log';
import type {
    PlaywrightGotoOptions,
    PlaywrightRequestHandler,
    Request,
} from '@crawlee/playwright';
import {
    PlaywrightCrawler,
    RequestList,
} from '@crawlee/playwright';
import express from 'express';
import playwright from 'playwright';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

import { startExpressAppPromise } from '../../shared/_helper';

if (os.platform() === 'win32') jest.setTimeout(2 * 60 * 1e3);

describe('PlaywrightCrawler', () => {
    let prevEnvHeadless: string;
    let logLevel: number;
    const localStorageEmulator = new MemoryStorageEmulator();
    let requestList: RequestList;

    const HOSTNAME = '127.0.0.1';
    let port: number;
    let server: Server;

    beforeAll(async () => {
        const app = express();
        server = await startExpressAppPromise(app, 0);
        port = (server.address() as AddressInfo).port;
        app.get('/', (req, res) => {
            res.send(`<html><head><title>Example Domain</title></head></html>`);
            res.status(200);
        });
    });

    beforeAll(async () => {
        prevEnvHeadless = process.env.CRAWLEE_HEADLESS;
        process.env.CRAWLEE_HEADLESS = '1';
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    beforeEach(async () => {
        await localStorageEmulator.init();

        const sources = [`http://${HOSTNAME}:${[port]}/`];
        requestList = await RequestList.open(`sources-${Math.random() * 10000}`, sources);
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
    });

    afterAll(async () => {
        log.setLevel(logLevel);
        process.env.CRAWLEE_HEADLESS = prevEnvHeadless;
    });
    afterAll(async () => {
        server.close();
    });

    jest.setTimeout(2 * 60 * 1e3);
    describe('should work', () => {
        // @TODO: add webkit
        test.each(['chromium', 'firefox'] as const)('with %s', async (browser) => {
            const sourcesLarge = [
                { url: `http://${HOSTNAME}:${port}/?q=1` },
                { url: `http://${HOSTNAME}:${port}/?q=2` },
                { url: `http://${HOSTNAME}:${port}/?q=3` },
                { url: `http://${HOSTNAME}:${port}/?q=4` },
                { url: `http://${HOSTNAME}:${port}/?q=5` },
                { url: `http://${HOSTNAME}:${port}/?q=6` },
            ];
            const sourcesCopy = JSON.parse(JSON.stringify(sourcesLarge));
            const processed: Request[] = [];
            const failed: Request[] = [];
            const requestListLarge = await RequestList.open({ sources: sourcesLarge });
            const requestHandler = async ({ page, request, response }: Parameters<PlaywrightRequestHandler>[0]) => {
                expect(response.status()).toBe(200);
                request.userData.title = await page.title();
                processed.push(request);
                expect(response.request().headers()['user-agent']).not.toMatch(/headless/i);
                await expect(page.evaluate(() => window.navigator.webdriver)).resolves.toBeFalsy();
            };

            const playwrightCrawler = new PlaywrightCrawler({
                launchContext: {
                    launcher: playwright[browser],
                },
                browserPoolOptions: { useFingerprints: false },
                requestList: requestListLarge,
                minConcurrency: 1,
                maxConcurrency: 1,
                requestHandler,
                failedRequestHandler: ({ request }) => {
                    failed.push(request);
                },
            });

            await playwrightCrawler.run();

            expect(playwrightCrawler.autoscaledPool.minConcurrency).toBe(1);
            expect(processed).toHaveLength(6);
            expect(failed).toHaveLength(0);

            processed.forEach((request, id) => {
                expect(request.url).toEqual(sourcesCopy[id].url);
                expect(request.userData.title).toBe('Example Domain');
            });
        });
    });

    test('should override goto timeout with navigationTimeoutSecs', async () => {
        const timeoutSecs = 10;
        let options: PlaywrightGotoOptions;
        const playwrightCrawler = new PlaywrightCrawler({
            requestList,
            maxRequestRetries: 0,
            maxConcurrency: 1,
            requestHandler: () => {
            },
            preNavigationHooks: [(_context, gotoOptions) => {
                options = gotoOptions;
            }],
            navigationTimeoutSecs: timeoutSecs,
        });

        await playwrightCrawler.run();
        expect(options.timeout).toEqual(timeoutSecs * 1000);
    });

    test('shallow clones browserPoolOptions before normalization', () => {
        const options = {
            browserPoolOptions: {},
            requestHandler: async () => {},
        };

        void new PlaywrightCrawler(options);
        void new PlaywrightCrawler(options);

        expect(Object.keys(options.browserPoolOptions).length).toBe(0);
    });
});
