import fs from 'fs';
import type { Server } from 'http';
import http from 'http';
import type { AddressInfo } from 'net';
import path from 'path';
import util from 'util';

import { BrowserLauncher, launchPuppeteer } from '@crawlee/puppeteer';
import type { Dictionary } from '@crawlee/utils';
// @ts-expect-error no types
import basicAuthParser from 'basic-auth-parser';
// @ts-expect-error no types
import portastic from 'portastic';
// @ts-expect-error no types
import proxy from 'proxy';
import type { Browser, Page } from 'puppeteer';

import { runExampleComServer } from '../../shared/_helper';

let prevEnvHeadless: string;
let proxyServer: Server;
let proxyPort: number;
const proxyAuth = { scheme: 'Basic', username: 'username', password: 'password' };
let wasProxyCalled = false;

let serverAddress = 'http://localhost:';
let port: number;
let server: Server;
beforeAll(async () => {
    [server, port] = await runExampleComServer();
    serverAddress += port;
});

afterAll(() => {
    server.close();
});

// Setup local proxy server for the tests
beforeAll(() => {
    prevEnvHeadless = process.env.CRAWLEE_HEADLESS;
    process.env.CRAWLEE_HEADLESS = '1';

    // Find free port for the proxy
    return portastic.find({ min: 50100, max: 50199 }).then((ports: number[]) => {
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
    process.env.CRAWLEE_HEADLESS = prevEnvHeadless;

    if (proxyServer) await util.promisify(proxyServer.close).bind(proxyServer)();
}, 5000);

describe('launchPuppeteer()', () => {
    test('throws on invalid args', async () => {
        // @ts-expect-error Validating JS side
        await expect(launchPuppeteer('some non-object')).rejects.toThrow(Error);
        // @ts-expect-error Validating JS side
        await expect(launchPuppeteer(1234)).rejects.toThrow(Error);

        // @ts-expect-error Validating JS side
        await expect(launchPuppeteer({ proxyUrl: 234 })).rejects.toThrow(Error);
        // @ts-expect-error Validating JS side
        await expect(launchPuppeteer({ proxyUrl: {} })).rejects.toThrow(Error);
        await expect(launchPuppeteer({ proxyUrl: 'invalidurl' })).rejects.toThrow(Error);
        await expect(launchPuppeteer({ proxyUrl: 'invalid://somehost:1234' })).rejects.toThrow(Error);
        await expect(launchPuppeteer({ proxyUrl: 'socks4://user:pass@example.com:1234' })).rejects.toThrow(Error);
        await expect(launchPuppeteer({ proxyUrl: 'socks5://user:pass@example.com:1234' })).rejects.toThrow(Error);
        await expect(launchPuppeteer({ proxyUrl: ' something really bad' })).rejects.toThrow(Error);

        // @ts-expect-error Validating JS side
        await expect(launchPuppeteer({ launchOptions: { args: 'wrong args' } })).rejects.toThrow(Error);
        // @ts-expect-error Validating JS side
        await expect(launchPuppeteer({ launchOptions: { args: [12, 34] } })).rejects.toThrow(Error);
    });

    test('supports non-HTTP proxies without authentication', async () => {
        const closePromises = [];
        const browser1 = await launchPuppeteer({ proxyUrl: 'socks4://example.com:1234' });
        closePromises.push(browser1.close());

        const browser2 = await launchPuppeteer({ proxyUrl: 'socks5://example.com:1234' });
        closePromises.push(browser2.close());

        const browser3 = await launchPuppeteer({ proxyUrl: 'https://example.com:1234' });
        closePromises.push(browser3.close());

        const browser4 = await launchPuppeteer({ proxyUrl: 'HTTP://example.com:1234' });
        closePromises.push(browser4.close());
        await Promise.all(closePromises);
    });

    test('opens a webpage', () => {
        let browser: Browser;
        let page: Page;

        return launchPuppeteer()
            .then((createdBrowser) => {
                browser = createdBrowser;

                return browser.newPage();
            })
            .then((openedPage) => {
                page = openedPage;

                return page.goto(serverAddress);
            })
            .then(() => page.content())
            .then((html) => expect(html).toMatch('<h1>Example Domain</h1>'))
            .then(() => browser.close());
    });

    test.skip('opens a webpage via proxy with authentication', () => {
        let browser: Browser;
        let page: Page;

        // Test headless parameter
        process.env.CRAWLEE_HEADLESS = '0';

        return launchPuppeteer({
            launchOptions: { headless: true },
            proxyUrl: `http://username:password@127.0.0.1:${proxyPort}`,
        })
            .then((createdBrowser) => {
                browser = createdBrowser;

                return browser.newPage();
            })
            .then((openedPage) => {
                page = openedPage;

                return page.goto(serverAddress);
            })
            .then(() => {
                expect(wasProxyCalled).toBe(true);

                return page.content();
            })
            .then((html) => expect(html).toMatch('<h1>Example Domain</h1>'))
            .then(() => browser.close());
    });

    test('supports userAgent option', () => {
        let browser: Browser;
        let page: Page;

        const opts = {
            // Have space in user-agent to test passing of params
            userAgent: 'MyUserAgent/1234 AnotherString/456',
            launchOptions: { headless: true },
        };

        return launchPuppeteer(opts)
            .then((result) => {
                browser = result;
            })
            .then(() => {
                return browser.newPage();
            })
            .then((result) => {
                page = result;
                return page.goto(`${serverAddress}/special/getDebug`);
            })
            .then(() => {
                return page.content();
            })
            .then((html) => {
                expect(html).toMatch(`"user-agent":"${opts.userAgent}"`);
                return browser.close();
            });
    });

    test('supports useChrome option', async () => {
        const spy = jest.spyOn(BrowserLauncher.prototype as any, '_getTypicalChromeExecutablePath');

        let browser;
        const opts = {
            useChrome: true,
            launchOptions: { headless: true, timeout: 60e3 },
        };

        try {
            browser = await launchPuppeteer(opts);
            const page = await browser.newPage();

            await page.setDefaultNavigationTimeout(0);

            // Add a test to go to an actual domain because we've seen issues
            // where pages would not load at all with Chrome.
            await page.goto(`${serverAddress}/example`);
            const title = await page.title();
            const version = await browser.version();

            expect(title).toBe('Example Domain');
            expect(version).toMatch('Chrome');
            expect(version).not.toMatch('Chromium');
            expect(spy).toBeCalledTimes(1);
        } finally {
            spy.mockRestore();
            if (browser) await browser.close();
        }
    });

    test('launcher option works with type object', async () => {
        const someProps: Dictionary = { foo: 'bar' };
        // Make it circular for extra security.
        someProps.props = someProps;
        let browser;
        try {
            browser = await launchPuppeteer({
                launcher: {
                    launch: async () => {
                        return {
                            on() {},
                            close() {},
                            newPage() {},
                        };
                    },
                    someProps,
                },
                launchOptions: { headless: true },
            });
        } finally {
            if (browser) await browser.close();
        }
    });

    test('supports useIncognitoPages: true', async () => {
        let browser;
        try {
            browser = await launchPuppeteer({
                useIncognitoPages: true,
                launchOptions: { headless: true },
            });
            const page1 = await browser.newPage();
            const context1 = page1.browserContext();
            const page2 = await browser.newPage();
            const context2 = page2.browserContext();
            expect(context1).not.toBe(context2);
        } finally {
            if (browser) await browser.close();
        }
    });

    test('supports useIncognitoPages: false', async () => {
        let browser;
        try {
            browser = await launchPuppeteer({
                useIncognitoPages: false,
                launchOptions: { headless: true },
            });
            const page1 = await browser.newPage();
            const context1 = page1.browserContext();
            const page2 = await browser.newPage();
            const context2 = page2.browserContext();
            expect(context1).toBe(context2);
        } finally {
            if (browser) await browser.close();
        }
    });

    test('supports userDataDir', async () => {
        const userDataDir = path.join(__dirname, 'userDataPuppeteer');

        let browser;
        try {
            browser = await launchPuppeteer({
                useIncognitoPages: false,
                launchOptions: {
                    userDataDir,
                    headless: true,
                },
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
