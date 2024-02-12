import type { Server } from 'http';
import type { AddressInfo } from 'net';

import {
    AdaptivePlaywrightCrawler, RequestList,
} from '@crawlee/playwright';
import express from 'express';
import { startExpressAppPromise } from 'test/shared/_helper';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

describe('AdaptivePlaywrightCrawler', () => {
    // Set up an express server that will serve test pages
    const HOSTNAME = '127.0.0.1';
    let port: number;
    let server: Server;

    beforeAll(async () => {
        const app = express();
        server = await startExpressAppPromise(app, 0);
        port = (server.address() as AddressInfo).port;

        app.get('/static', (req, res) => {
            res.send(`
                <html>
                    <head>
                        <title>Example Domain</title>
                    </head>
                    <body>
                        <h1>Heading</h1>
                    </body>
                </html>
             `);
            res.status(200);
        });

        app.get('/dynamic', (req, res) => {
            res.send(`
                <html>
                    <head>
                        <title>Example Domain</title>
                        <script type="text/javascript">
                            setTimeout(() => {document.body.innerHTML = "<h1>Heading</h1>"}, 2000)
                        </script>
                    </head>
                    <body>
                    </body>
                </html>
             `);
            res.status(200);
        });
    });
    afterAll(async () => {
        server.close();
    });

    // Set up local storage emulator
    const localStorageEmulator = new MemoryStorageEmulator();

    beforeEach(async () => {
        await localStorageEmulator.init();
    });
    afterAll(async () => {
        await localStorageEmulator.destroy();
    });

    describe('should detect page rendering type', () => {
        test.each([['/static', 'static'], ['/dynamic', 'clientOnly']] as const)('for %s', async (path, expectedType) => {
            // Set up a mock rendering type predictor that will check detection results
            const renderingTypePredictor = {
                predict: (_url: URL) => ({ detectionProbabilityRecommendation: 1, renderingType: 'clientOnly' } as const),
                storeResult: (_url: URL, _label: string | unknown, _renderingType: string) => {},
            };

            const predictSpy = vi.spyOn(renderingTypePredictor, 'predict');
            const storeResultSpy = vi.spyOn(renderingTypePredictor, 'storeResult');

            const url = new URL(`http://${HOSTNAME}:${port}${path}`);

            const crawler = new AdaptivePlaywrightCrawler({
                renderingTypeDetectionRatio: 0.1,
                renderingTypePredictor,
                maxConcurrency: 1,
                maxRequestRetries: 0,
                maxRequestsPerCrawl: 1,
                requestHandler: async ({ pushData, querySelector }) => {
                    await pushData({
                        heading: (await querySelector('h1')).text(),
                    });
                },
                requestList: await RequestList.open({ sources: [url.toString()] }),
            });

            await crawler.run();

            expect(predictSpy).toHaveBeenCalledWith(url, undefined);
            expect(storeResultSpy).toHaveBeenCalledWith(url, undefined, expectedType);
        });
    });
});
