import { launchPuppeteer, utils } from 'crawlee';
import { sleep } from '@crawlee/utils';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import type { HTTPRequest } from 'puppeteer';
import { runExampleComServer } from '../shared/_helper';

const { addInterceptRequestHandler, removeInterceptRequestHandler } = utils.puppeteer;

// Simple page with image, script and stylesheet links.
let HTML_PAGE = '';

let serverAddress = 'http://localhost:';
let port: number;
let server: Server;

beforeAll(async () => {
    [server, port] = await runExampleComServer();
    serverAddress += port;
    HTML_PAGE = `<html><body>
    <link rel="stylesheet" type="text/css" href="${serverAddress}/style.css">
    <img src="${serverAddress}/image.png" />
    <script src="${serverAddress}/script.js" defer="defer">></script>
</body></html>`;
});

afterAll(() => {
    server.close();
});
describe('utils.puppeteer.addInterceptRequestHandler|removeInterceptRequestHandler()', () => {
    test('should allow multiple handlers', async () => {
        const browser = await launchPuppeteer({ launchOptions: { headless: true } });

        const allUrls: string[] = [];
        const loadedUrls: string[] = [];

        try {
            const page = await browser.newPage();

            // Just collect all URLs.
            await addInterceptRequestHandler(page, (request) => {
                allUrls.push(request.url());
                return request.continue();
            });

            // Abort images.
            await addInterceptRequestHandler(page, (request) => {
                if (request.resourceType() === 'image') return request.abort();
                return request.continue();
            });

            // Abort scripts.
            await addInterceptRequestHandler(page, (request) => {
                if (request.resourceType() === 'script') return request.abort();
                return request.continue();
            });

            // Save all loaded URLs.
            page.on('response', (response) => loadedUrls.push(response.url()));

            await page.setContent(HTML_PAGE, { waitUntil: 'networkidle0' });
        } finally {
            await browser.close();
        }

        expect(allUrls).toEqual(expect.arrayContaining([
            `${serverAddress}/script.js`,
            `${serverAddress}/style.css`,
            `${serverAddress}/image.png`,
        ]));

        expect(loadedUrls).toEqual(expect.arrayContaining([
            `${serverAddress}/style.css`,
        ]));
    });

    test('should not propagate aborted/responded requests to following handlers', async () => {
        const browser = await launchPuppeteer({ launchOptions: { headless: true } });
        const propagatedUrls: string[] = [];

        try {
            const page = await browser.newPage();

            // Abort images.
            await addInterceptRequestHandler(page, (request) => {
                if (request.resourceType() === 'image') return request.abort();
                return request.continue();
            });

            // Respond scripts.
            await addInterceptRequestHandler(page, (request) => {
                if (request.resourceType() === 'script') {
                    return request.respond({
                        status: 404,
                    });
                }
                return request.continue();
            });

            // Just collect all URLs propagated to the last handler.
            await addInterceptRequestHandler(page, (request) => {
                propagatedUrls.push(request.url());
                return request.continue();
            });
            await page.setContent(HTML_PAGE, { waitUntil: 'networkidle0' });
        } finally {
            await browser.close();
        }

        expect(propagatedUrls).toEqual(expect.arrayContaining([
            `${serverAddress}/style.css`,
        ]));
    });

    test('should allow to modify request', async () => {
        const browser = await launchPuppeteer({ launchOptions: { headless: true } });

        try {
            const page = await browser.newPage();

            // Change all requests to DELETE.
            await addInterceptRequestHandler(page, (request) => {
                return request.continue({ method: 'DELETE' });
            });
            // Add some query parameters to request URLs.
            await addInterceptRequestHandler(page, (request) => {
                return request.continue({
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                    },
                    postData: '{ "foo": "bar" }',
                });
            });
            // Change all requests to POST and add payload.
            await addInterceptRequestHandler(page, (request) => {
                return request.continue({
                    method: 'POST',
                });
            });

            // Check response that it's correct.
            const response = await page.goto(`${serverAddress}/special/getDebug`, { waitUntil: 'networkidle0' });
            const { method, headers, bodyLength } = JSON.parse(await response.text());
            expect(method).toBe('POST');
            expect(bodyLength).toBe(16);
            expect(headers['content-type']).toBe('application/json; charset=utf-8');
        } finally {
            await browser.close();
        }
    });

    test('should allow async handler', async () => {
        const browser = await launchPuppeteer({ launchOptions: { headless: true } });

        try {
            const page = await browser.newPage();

            await addInterceptRequestHandler(page, async (request) => {
                await sleep(100);
                return request.continue({
                    method: 'POST',
                });
            });

            // Check response that it's correct.
            const response = await page.goto(`${serverAddress}/special/getDebug`, { waitUntil: 'networkidle0' });
            const { method } = JSON.parse(await response.text());
            expect(method).toBe('POST');
        } finally {
            await browser.close();
        }
    });

    describe('internal handleRequest function should return correctly formated headers', () => {
        test('should correctly capitalize headers', async () => {
            const browser = await launchPuppeteer({ launchOptions: { headless: true } });

            try {
                const page = await browser.newPage();

                await addInterceptRequestHandler(page, async (request) => {
                    // Override headers
                    const headers = {
                        ...request.headers(),
                        'accept': 'text/html',
                        'accept-language': 'en-GB',
                        'upgrade-insecure-requests': '2',
                    };
                    return request.continue({ headers });
                });

                const response = await page.goto(`${serverAddress}/special/getRawHeaders`);
                const rawHeadersArr = JSON.parse(await response.text()) as string[];

                const acceptIndex = rawHeadersArr.findIndex((headerItem) => headerItem === 'Accept');
                expect(typeof acceptIndex).toBe('number');
                expect(rawHeadersArr[acceptIndex + 1]).toEqual('text/html');

                const acceptLanguageIndex = rawHeadersArr.findIndex((headerItem) => headerItem === 'Accept-Language');
                expect(typeof acceptLanguageIndex).toBe('number');
                expect(rawHeadersArr[acceptLanguageIndex + 1]).toEqual('en-GB');

                const upgradeInsReqIndex = rawHeadersArr.findIndex((headerItem) => headerItem === 'Upgrade-Insecure-Requests');
                expect(typeof upgradeInsReqIndex).toBe('number');
                expect(rawHeadersArr[upgradeInsReqIndex + 1]).toEqual('2');

                // defaults should be capitalized too
                const connectionIndex = rawHeadersArr.findIndex((headerItem) => headerItem === 'Connection');
                expect(typeof connectionIndex).toBe('number');
                expect(rawHeadersArr[connectionIndex + 1]).toEqual('keep-alive');
            } finally {
                await browser.close();
            }
        });
    });
});

describe('utils.puppeteer.removeInterceptRequestHandler()', () => {
    test('works', async () => {
        const browser = await launchPuppeteer({ launchOptions: { headless: true } });

        const loadedUrls: string[] = [];

        try {
            const page = await browser.newPage();
            page.on('response', (response) => loadedUrls.push(response.url()));

            // Abort images.
            const abortImagesHandler = (request: HTTPRequest) => {
                if (request.resourceType() === 'image') return request.abort();
                return request.continue();
            };
            await addInterceptRequestHandler(page, abortImagesHandler);

            // Abort scripts.
            await addInterceptRequestHandler(page, (request) => {
                if (request.resourceType() === 'script') return request.abort();
                return request.continue();
            });

            // Load with scripts and images disabled.
            await page.setContent('<html><body></body></html>');
            await page.setContent(HTML_PAGE, { waitUntil: 'networkidle0' });
            expect(loadedUrls).toEqual(expect.arrayContaining([
                `${serverAddress}/style.css`,
            ]));

            // Try it once again.
            await page.setContent('<html><body></body></html>');
            await page.setContent(HTML_PAGE, { waitUntil: 'networkidle0' });
            expect(loadedUrls).toEqual(expect.arrayContaining([
                `${serverAddress}/style.css`,
                `${serverAddress}/style.css`,
            ]));

            // Enable images.
            await removeInterceptRequestHandler(page, abortImagesHandler);

            // Try to load once again if images appear there.
            await page.setContent('<html><body></body></html>');
            await page.setContent(HTML_PAGE, { waitUntil: 'networkidle0' });
            expect(loadedUrls).toEqual(expect.arrayContaining([
                `${serverAddress}/style.css`,
                `${serverAddress}/style.css`,
                `${serverAddress}/style.css`,
                `${serverAddress}/image.png`,
            ]));
        } finally {
            await browser.close();
        }
    });
});
