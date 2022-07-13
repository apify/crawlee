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
    ['Playwright', new PlaywrightPlugin(playwright.chromium, { useIncognitoPages: true })],
])('BrowserPool - %s - proxy sugar syntax', (_, plugin) => {
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

    test('should work', async () => {
        const pool = new BrowserPool({
            browserPlugins: [plugin],
        });

        const options = {
            proxyUrl: `http://foo:bar@127.0.0.2:${protectedProxy.port}`,
            pageOptions: {
                proxy: {
                    bypass: '<-loopback>',
                },
                proxyBypassList: ['<-loopback>'],
            },
        };

        const page = await pool.newPage(options);

        const response = await page.goto(`http://127.0.0.1:${(target.address() as AddressInfo).port}`);
        const content = await response!.text();

        // Fails on Windows.
        // See https://github.com/puppeteer/puppeteer/issues/7698
        if (process.platform !== 'win32') {
            expect(content).toBe('127.0.0.2');
        }

        await page.close();

        await pool.destroy();
    });
});
