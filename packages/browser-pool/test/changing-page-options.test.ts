import type { PrePageCreateHook, PuppeteerController, PlaywrightController } from '@crawlee/browser-pool';
import { BrowserPool, PuppeteerPlugin, PlaywrightPlugin } from '@crawlee/browser-pool';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import puppeteer from 'puppeteer';
import playwright from 'playwright';
import type { Server as ProxyChainServer } from 'proxy-chain';
import { promisify } from 'node:util';
import { createProxyServer } from '../../../test/browser-pool/browser-plugins/create-proxy-server';

describe.each([
    ['Puppeteer', new PuppeteerPlugin(puppeteer, { useIncognitoPages: true })],
    ['Playwright', new PlaywrightPlugin(playwright.chromium, {
        useIncognitoPages: true,
        launchOptions: {
            args: [
                // Exclude loopback interface from proxy bypass list,
                // so the request to localhost goes through proxy.
                // This way there's no need for a 3rd party server.
                '--proxy-bypass-list=<-loopback>',
            ],
        },
    })], // Chromium is faster than firefox and webkit
])('BrowserPool - %s - prePageCreateHooks > should allow changing pageOptions', (_, plugin) => {
    let target: http.Server;
    let protectedProxy: ProxyChainServer;

    beforeAll(async () => {
        target = http.createServer((request, response) => {
            response.end(request.socket.remoteAddress);
        });
        await promisify(target.listen.bind(target) as any)(0, '127.0.0.1');

        protectedProxy = createProxyServer('127.0.0.2', 'foo', 'bar');
        await protectedProxy.listen();
    });

    afterAll(async () => {
        await promisify(target.close.bind(target))();

        await protectedProxy.close(false);
    });

    test('should allow changing pageOptions', async () => {
        const hook: PrePageCreateHook<PlaywrightController | PuppeteerController> = (_pageId, _controller, pageOptions) => {
            if (!pageOptions) {
                expect(false).toBe(true);
                return;
            }

            const newOptions = {
                // Puppeteer options
                proxyServer: `http://127.0.0.2:${protectedProxy.port}`,
                proxyUsername: 'foo',
                proxyPassword: 'bar',
                proxyBypassList: ['<-loopback>'],

                // Playwright options
                proxy: {
                    server: `http://127.0.0.2:${protectedProxy.port}`,
                    username: 'foo',
                    password: 'bar',
                    bypass: '<-loopback>',
                },
            };

            Object.assign(pageOptions, newOptions);
        };

        const pool = new BrowserPool({
            browserPlugins: [plugin],
            prePageCreateHooks: [hook],
        });

        try {
            const page = await pool.newPage();

            try {
                const response = await page.goto(`http://127.0.0.1:${(target.address() as AddressInfo).port}`);
                const content = await response!.text();

                // Fails on Windows.
                // See https://github.com/puppeteer/puppeteer/issues/7698
                if (process.platform !== 'win32') {
                    expect(content).toBe('127.0.0.2');
                }
            } finally {
                await page.close();
            }
        } finally {
            await pool.destroy();
        }
    });
});
