import fs from 'fs';
import type { Server } from 'http';
import http from 'http';
import type { AddressInfo } from 'net';
import path from 'path';
import util from 'util';

import { BrowserLauncher, Configuration, launchPlaywright, PlaywrightLauncher } from '@crawlee/playwright';
// @ts-expect-error no types
import basicAuthParser from 'basic-auth-parser';
import type { Browser, BrowserType } from 'playwright';
// @ts-expect-error no types
import portastic from 'portastic';
// @ts-expect-error no types
import proxy from 'proxy';
import { runExampleComServer } from 'test/shared/_helper';

let prevEnvHeadless: boolean;
let proxyServer: Server;
let proxyPort: number;
const proxyAuth = { scheme: 'Basic', username: 'username', password: 'password' };
let wasProxyCalled = false;

let port: number;
let server: Server;
let serverAddress = 'http://localhost:';

// Setup local proxy server for the tests
beforeAll(async () => {
    const config = Configuration.getGlobalConfig();
    prevEnvHeadless = config.get('headless');
    config.set('headless', true);

    [server, port] = await runExampleComServer();
    serverAddress += port;

    // Find free port for the proxy
    return portastic.find({ min: 50000, max: 50099 }).then(async (ports: number[]) => {
        return new Promise<void>((resolve, reject) => {
            const httpServer = http.createServer();

            // Setup proxy authorization
            // @ts-expect-error
            httpServer.authenticate = function (req, fn) {
                // parse the "Proxy-Authorization" header
                const auth = req.headers['proxy-authorization'];
                if (!auth) {
                    // optimization: don't invoke the child process if no
                    // "Proxy-Authorization" header was given
                    return fn(null, false);
                }
                const parsed = basicAuthParser(auth);
                const isEqual = JSON.stringify(parsed) === JSON.stringify(proxyAuth);
                if (isEqual) wasProxyCalled = true;
                fn(null, isEqual);
            };

            httpServer.on('error', reject);

            proxyServer = proxy(httpServer);
            proxyServer.listen(ports[0], () => {
                proxyPort = (proxyServer.address() as AddressInfo).port;
                resolve();
            });
        });
    });
});

afterAll(async () => {
    Configuration.getGlobalConfig().set('headless', prevEnvHeadless);

    server.close();
    if (proxyServer) await util.promisify(proxyServer.close).bind(proxyServer)();
}, 5000);

describe('launchPlaywright()', () => {
    test('throws on invalid args', async () => {
        // @ts-expect-error Validating JS side
        await expect(launchPlaywright('some non-object')).rejects.toThrow(Error);
        // @ts-expect-error Validating JS side
        await expect(launchPlaywright(1234)).rejects.toThrow(Error);

        // @ts-expect-error Validating JS side
        await expect(launchPlaywright({ proxyUrl: 234 })).rejects.toThrow(Error);
        // @ts-expect-error Validating JS side
        await expect(launchPlaywright({ proxyUrl: {} })).rejects.toThrow(Error);
        await expect(launchPlaywright({ proxyUrl: 'invalidurl' })).rejects.toThrow(Error);
        await expect(launchPlaywright({ proxyUrl: 'invalid://somehost:1234' })).rejects.toThrow(Error);
        await expect(launchPlaywright({ proxyUrl: 'socks4://user:pass@example.com:1234' })).rejects.toThrow(Error);
        await expect(launchPlaywright({ proxyUrl: 'socks5://user:pass@example.com:1234' })).rejects.toThrow(Error);
        await expect(launchPlaywright({ proxyUrl: ' something really bad' })).rejects.toThrow(Error);
    });

    test('supports non-HTTP proxies without authentication', async () => {
        const closePromises = [];
        const browser1 = await launchPlaywright({ proxyUrl: 'socks4://example.com:1234' });
        closePromises.push(browser1.close());

        const browser2 = await launchPlaywright({ proxyUrl: 'socks5://example.com:1234' });
        closePromises.push(browser2.close());

        const browser3 = await launchPlaywright({ proxyUrl: 'https://example.com:1234' });
        closePromises.push(browser3.close());

        const browser4 = await launchPlaywright({ proxyUrl: 'HTTP://example.com:1234' });
        closePromises.push(browser4.close());
        await Promise.all(closePromises);
    });

    test('opens a webpage', async () => {
        const browser = await launchPlaywright();
        const page = await browser.newPage();

        await page.goto(serverAddress);
        const html = await page.content();
        expect(html).toMatch('<h1>Example Domain</h1>');
        await browser.close();
    });
    describe('headful mode', () => {
        let browser: Browser;

        beforeAll(() => {
            // Test headless parameter
            Configuration.getGlobalConfig().set('headless', false);
        });

        beforeEach(async () => {
            browser = await launchPlaywright({
                launchOptions: { headless: true, timeout: 60e3 },
                proxyUrl: `http://username:password@127.0.0.1:${proxyPort}`,
            });
        });

        afterEach(async () => {
            if (browser) await browser.close();
        });

        afterAll(() => {
            Configuration.getGlobalConfig().set('headless', true);
        });

        test('opens a webpage via proxy with authentication', async () => {
            const page = await browser.newPage();

            await page.goto(serverAddress);
            expect(wasProxyCalled).toBe(true);

            const html = await page.content();
            expect(html).toMatch('<h1>Example Domain</h1>');
        });
    });

    test('supports useChrome option', async () => {
        const spy = vitest.spyOn(BrowserLauncher.prototype as any, '_getTypicalChromeExecutablePath');
        let browser;
        const opts = {
            useChrome: true,
            launchOptions: { timeout: 60e3 },
        };

        try {
            browser = await launchPlaywright(opts);
            const page = await browser.newPage();

            // Add a test to go to an actual domain because we've seen issues
            // where pages would not load at all with Chrome.
            await page.goto(serverAddress);
            const title = await page.title();
            const version = browser.version();

            expect(title).toBe('Example Domain');
            expect(version).not.toMatch('Chromium');
            expect(spy).toBeCalledTimes(1);
        } finally {
            if (browser) await browser.close();
        }
    }, 60e3);

    describe('Default browser path', () => {
        const target = 'test';

        beforeAll(() => {
            process.env.CRAWLEE_DEFAULT_BROWSER_PATH = target;
        });

        afterAll(() => {
            delete process.env.CRAWLEE_DEFAULT_BROWSER_PATH;
        });

        test('uses Apify default browser path', () => {
            const launcher = new PlaywrightLauncher({
                launcher: {} as BrowserType,
            });
            const plugin = launcher.createBrowserPlugin();

            expect(plugin!.launchOptions.executablePath).toEqual(target);
        });

        test('does not use default when using chrome', () => {
            const launcher = new PlaywrightLauncher({
                useChrome: true,
                launcher: {} as BrowserType,
            });
            const plugin = launcher.createBrowserPlugin();

            // @ts-expect-error private method
            expect(plugin.launchOptions.executablePath).toBe(launcher._getTypicalChromeExecutablePath());
        }, 60e3);

        test('allows to be overridden', () => {
            const newPath = 'newPath';

            const launcher = new PlaywrightLauncher({
                launchOptions: {
                    executablePath: newPath,
                },
                launcher: {} as BrowserType,
            });
            const plugin = launcher.createBrowserPlugin();

            expect(plugin.launchOptions.executablePath).toEqual(newPath);
        });

        test('works without default path', async () => {
            delete process.env.CRAWLEE_DEFAULT_BROWSER_PATH;
            let browser;
            try {
                browser = await launchPlaywright();
                const page = await browser.newPage();

                await page.goto(serverAddress);
                const title = await page.title();

                expect(title).toBe('Example Domain');
            } finally {
                if (browser) await browser.close();
            }
        });
    });

    test('supports useIncognitoPages: true', async () => {
        let browser;
        try {
            browser = await launchPlaywright({
                useIncognitoPages: true,
                launchOptions: { headless: true },
            });
            const page1 = await browser.newPage();
            const context1 = page1.context();
            const page2 = await browser.newPage();
            const context2 = page2.context();
            expect(context1).not.toBe(context2);
        } finally {
            if (browser) await browser.close();
        }
    });

    test('supports useIncognitoPages: false', async () => {
        let browser;
        try {
            browser = await launchPlaywright({
                useIncognitoPages: false,
                launchOptions: { headless: true },
            });
            const page1 = await browser.newPage();
            const context1 = page1.context();
            const page2 = await browser.newPage();
            const context2 = page2.context();
            expect(context1).toBe(context2);
        } finally {
            if (browser) await browser.close();
        }
    });

    test('supports userDataDir', async () => {
        const userDataDir = path.join(__dirname, 'userDataPlaywright');

        let browser;
        try {
            browser = await launchPlaywright({
                useIncognitoPages: false,
                userDataDir,
            });
        } finally {
            if (browser) await browser.close();
        }

        fs.accessSync(path.join(userDataDir, 'Default'));

        fs.rmSync(userDataDir, {
            force: true,
            recursive: true,
        });
    });
});
