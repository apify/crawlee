import type { AddressInfo } from 'net';
import type { Server } from 'http';
import http from 'http';
import { promisify } from 'util';

import type { Server as ProxyChainServer } from 'proxy-chain';
import puppeteer from 'puppeteer';
import playwright from 'playwright';

import { PuppeteerPlugin, PlaywrightPlugin, PuppeteerController, PlaywrightController, PlaywrightBrowser, LaunchContext } from '@crawlee/browser-pool';
import type { UnwrapPromise, CommonLibrary } from '@crawlee/browser-pool';

import { runExampleComServer } from 'test/shared/_helper';
import { createProxyServer } from './create-proxy-server';

jest.setTimeout(120000);

let port: number;
let server: Server;
let serverAddress = 'http://localhost:';

beforeAll(async () => {
    [server, port] = await runExampleComServer();
    serverAddress += port;
});

afterAll(() => {
    server.close();
});

const runPluginTest = <
    P extends typeof PlaywrightPlugin | typeof PuppeteerPlugin,
    C extends typeof PuppeteerController | typeof PlaywrightController,
    L extends CommonLibrary,
>(Plugin: P, Controller: C, library: L) => {
    let plugin = new Plugin(library as never);

    describe(`${plugin.constructor.name} - ${'name' in library ? library.name!() : ''} general`, () => {
        let browser: playwright.Browser | UnwrapPromise<ReturnType<typeof puppeteer['launch']>> | undefined;

        beforeEach(() => {
            plugin = new Plugin(library as never);
        });

        afterEach(async () => {
            await browser?.close();
        });

        test('should launch browser', async () => {
            browser = await plugin.launch();
            expect(typeof browser.newPage).toBe('function');
            expect(typeof browser.close).toBe('function');
        });

        test('should create launch context', () => {
            const id = 'abc';
            const launchOptions = { foo: 'bar' };
            const proxyUrl = 'http://proxy.com/';
            const context = plugin.createLaunchContext({
                id,
                // @ts-expect-error Testing options
                launchOptions,
            });

            expect(context).toBeInstanceOf(LaunchContext);

            context.proxyUrl = proxyUrl;
            context.extend({
                one: 1,
            });

            const desiredObject = {
                id,
                launchOptions,
                browserPlugin: plugin,
                _proxyUrl: proxyUrl.slice(0, -1),
                one: 1,
                useIncognitoPages: false,
            };

            // expect(context).toMatchObject(desiredObject)
            // Switch to this after the issue with `TypeError: prop.startsWith is not a function` is solved.

            expect(context.id).toEqual(desiredObject.id);
            expect(context.launchOptions).toEqual(desiredObject.launchOptions);
            expect(context.browserPlugin).toEqual(desiredObject.browserPlugin);
            expect(context['_proxyUrl']).toEqual(desiredObject._proxyUrl); // eslint-disable-line
            expect(context.one).toEqual(desiredObject.one);
            expect(context.useIncognitoPages).toEqual(desiredObject.useIncognitoPages);
        });

        test('should get default launchContext values from plugin options', async () => {
            const proxyUrl = 'http://apify1234@10.10.10.0:8080/';

            plugin = new Plugin(library as never, {
                proxyUrl,
                userDataDir: 'test',
                useIncognitoPages: true,
            });

            const context = plugin.createLaunchContext();

            expect(context.proxyUrl).toEqual(proxyUrl.slice(0, -1));
            expect(context.useIncognitoPages).toBeTruthy();
            expect(context.userDataDir).toEqual('test');
        });

        test('should create browser controller', () => {
            const browserController = plugin.createController();
            expect(browserController).toBeInstanceOf(Controller);
        });

        test('should work with cookies', async () => {
            const browserController = plugin.createController();
            const context = plugin.createLaunchContext();

            browser = await plugin.launch(context as never);

            browserController.assignBrowser(browser as never, context as never);
            browserController.activate();

            const page = await browserController.newPage();
            await browserController.setCookies(page as never, [{ name: 'TEST', value: 'TESTER-COOKIE', url: serverAddress }]);
            await page.goto(serverAddress, { waitUntil: 'domcontentloaded' });

            const cookies = await browserController.getCookies(page as never);
            expect(cookies[0].name).toBe('TEST');
            expect(cookies[0].value).toBe('TESTER-COOKIE');
        });

        test('newPage options cannot be used with persistent context', async () => {
            const browserController = plugin.createController();

            const context = plugin.createLaunchContext({
                useIncognitoPages: false,
            });

            browser = await plugin.launch(context as never);
            browserController.assignBrowser(browser as never, context as never);
            browserController.activate();

            try {
                const page = await browserController.newPage({});
                await page.close();

                expect(false).toBe(true);
            } catch (error: any) {
                expect(error.message).toBe('A new page can be created with provided context only when using incognito pages or experimental containers.');
            }
        });
    });
};

describe('Plugins', () => {
    let target: http.Server;
    let unprotectedProxy: ProxyChainServer;
    let protectedProxy: ProxyChainServer;

    beforeAll(async () => {
        target = http.createServer((request, response) => {
            response.end(request.socket.remoteAddress);
        });
        await promisify(target.listen.bind(target) as any)(0, '127.0.0.1');

        unprotectedProxy = createProxyServer('127.0.0.2', '', '');
        await unprotectedProxy.listen();

        protectedProxy = createProxyServer('127.0.0.3', 'foo', 'bar');
        await protectedProxy.listen();
    });

    afterAll(async () => {
        await promisify(target.close.bind(target))();

        await unprotectedProxy.close(false);
        await protectedProxy.close(false);
    });

    describe('Puppeteer specifics', () => {
        let browser: puppeteer.Browser;

        afterEach(async () => {
            await browser.close();
        });

        test('should work with non authenticated proxyUrl', async () => {
            const proxyUrl = `http://127.0.0.2:${unprotectedProxy.port}`;
            const plugin = new PuppeteerPlugin(puppeteer);

            const context = plugin.createLaunchContext({
                proxyUrl,
                launchOptions: {
                    args: [
                        // Exclude loopback interface from proxy bypass list,
                        // so the request to localhost goes through proxy.
                        // This way there's no need for a 3rd party server.
                        '--proxy-bypass-list=<-loopback>',
                    ],
                },
            });

            browser = await plugin.launch(context);

            const page = await browser.newPage();
            const response = await page.goto(`http://127.0.0.1:${(target.address() as AddressInfo).port}`);

            const text = await response.text();

            expect(text).toBe('127.0.0.2');

            await page.close();
        });

        test('should work with authenticated proxyUrl', async () => {
            const proxyUrl = `http://foo:bar@127.0.0.3:${protectedProxy.port}`;
            const plugin = new PuppeteerPlugin(puppeteer);

            const context = plugin.createLaunchContext({
                proxyUrl,
                launchOptions: {
                    args: [
                        // Exclude loopback interface from proxy bypass list,
                        // so the request to localhost goes through proxy.
                        // This way there's no need for a 3rd party server.
                        '--proxy-bypass-list=<-loopback>',
                    ],
                },
            });

            browser = await plugin.launch(context);

            const page = await browser.newPage();
            const response = await page.goto(`http://127.0.0.1:${(target.address() as AddressInfo).port}`);

            const text = await response.text();

            expect(text).toBe('127.0.0.3');

            await page.close();

            await browser.close();
        });

        test('should use persistent context by default', async () => {
            const plugin = new PuppeteerPlugin(puppeteer);
            const browserController = plugin.createController();

            const launchContext = plugin.createLaunchContext();

            browser = await plugin.launch(launchContext);
            browserController.assignBrowser(browser, launchContext);
            browserController.activate();

            const page = await browserController.newPage();
            const browserContext = page.browserContext();

            expect(browserContext.isIncognito()).toBeFalsy();
        });

        test('should use incognito pages by option', async () => {
            const plugin = new PuppeteerPlugin(puppeteer);
            const browserController = plugin.createController();

            const launchContext = plugin.createLaunchContext({ useIncognitoPages: true });

            browser = await plugin.launch(launchContext);
            browserController.assignBrowser(browser, launchContext);
            browserController.activate();

            const page = await browserController.newPage();
            const browserContext = page.browserContext();

            expect(browserContext.isIncognito()).toBeTruthy();
        });

        test('should pass launch options to browser', async () => {
            const plugin = new PuppeteerPlugin(puppeteer);

            const userAgent = 'HelloWorld';

            const launchOptions = {
                args: [
                    `--user-agent=${userAgent}`,
                ],
            };

            const launchContext = plugin.createLaunchContext({ launchOptions });
            browser = await plugin.launch(launchContext);

            expect(await browser.userAgent()).toBe(userAgent);
        });

        test('proxyUsername and proxyPassword as newPage options', async () => {
            const plugin = new PuppeteerPlugin(puppeteer);
            const browserController = new PuppeteerController(plugin);

            const launchContext = plugin.createLaunchContext({
                useIncognitoPages: true,
            });

            browser = await plugin.launch(launchContext);
            browserController.assignBrowser(browser, launchContext);
            browserController.activate();

            const page = await browserController.newPage({
                proxyServer: `http://127.0.0.3:${protectedProxy.port}`,
                proxyUsername: 'foo',
                proxyPassword: 'bar',
                proxyBypassList: ['<-loopback>'],
            });

            const response = await page.goto(`http://127.0.0.1:${(target.address() as AddressInfo).port}`);
            const text = await response!.text();

            // FAILING. It should give 127.0.0.3 for all platforms.
            // See https://github.com/puppeteer/puppeteer/issues/7698
            expect(text).toBe(process.platform === 'win32' ? '127.0.0.1' : '127.0.0.3');

            await page.close();
        });
    });

    runPluginTest(PuppeteerPlugin, PuppeteerController, puppeteer);

    describe('Playwright specifics', () => {
        let browser: playwright.Browser;

        afterEach(async () => {
            await browser.close();
        });

        describe.each(['chromium', 'firefox', 'webkit'] as const)('with %s', (browserName) => {
            test('should work with non authenticated proxyUrl', async () => {
                const proxyUrl = `http://127.0.0.2:${unprotectedProxy.port}`;
                const plugin = new PlaywrightPlugin(playwright[browserName]);

                const launchOptions = browserName === 'chromium' ? {
                    args: [
                        // Exclude loopback interface from proxy bypass list,
                        // so the request to localhost goes through proxy.
                        // This way there's no need for a 3rd party server.
                        '--proxy-bypass-list=<-loopback>',
                    ],
                } : undefined;

                const context = plugin.createLaunchContext({
                    proxyUrl,
                    launchOptions,
                });

                browser = await plugin.launch(context);
                expect(context.launchOptions!.proxy!.server).toEqual(proxyUrl);

                const page = await browser.newPage();
                const response = await page.goto(`http://127.0.0.1:${(target.address() as AddressInfo).port}`);
                const text = await response!.text();

                expect(text).toBe('127.0.0.2');

                await page.close();
            });

            test('should work with authenticated proxyUrl', async () => {
                const proxyUrl = `http://foo:bar@127.0.0.3:${protectedProxy.port}`;
                const plugin = new PlaywrightPlugin(playwright[browserName]);

                const launchOptions = browserName === 'chromium' ? {
                    args: [
                        // Exclude loopback interface from proxy bypass list,
                        // so the request to localhost goes through proxy.
                        // This way there's no need for a 3rd party server.
                        '--proxy-bypass-list=<-loopback>',
                    ],
                } : undefined;

                const context = plugin.createLaunchContext({
                    proxyUrl,
                    launchOptions,
                });

                browser = await plugin.launch(context);

                const page = await browser.newPage();
                const response = await page.goto(`http://127.0.0.1:${(target.address() as AddressInfo).port}`);
                const text = await response!.text();

                expect(text).toBe('127.0.0.3');

                await page.close();
            });

            test('proxy as newPage option', async () => {
                const plugin = new PlaywrightPlugin(playwright.chromium);
                const browserController = new PlaywrightController(plugin);

                const launchContext = plugin.createLaunchContext({
                    useIncognitoPages: true,
                });

                browser = await plugin.launch(launchContext);
                browserController.assignBrowser(browser, launchContext);
                browserController.activate();

                const page = await browserController.newPage({
                    proxy: {
                        server: `http://127.0.0.3:${protectedProxy.port}`,
                        username: 'foo',
                        password: 'bar',
                        bypass: '<-loopback>',
                    },
                });

                const response = await page.goto(`http://127.0.0.1:${(target.address() as AddressInfo).port}`);
                const text = await response!.text();

                expect(text).toBe('127.0.0.3');

                await page.close();
            });

            test('should use incognito context by option', async () => {
                const plugin = new PlaywrightPlugin(playwright[browserName]);
                const browserController = plugin.createController();

                const launchContext = plugin.createLaunchContext({ useIncognitoPages: true });

                browser = await plugin.launch(launchContext);
                browserController.assignBrowser(browser, launchContext);
                browserController.activate();

                const page = await browserController.newPage();
                const browserContext = page.context();
                await browserController.newPage();

                expect(browserContext.pages()).toHaveLength(1);
            });

            test('should use persistent context by default', async () => {
                const plugin = new PlaywrightPlugin(playwright[browserName]);
                const browserController = plugin.createController();

                const launchContext = plugin.createLaunchContext();

                browser = await plugin.launch(launchContext);
                browserController.assignBrowser(browser, launchContext);
                browserController.activate();

                const page = await browserController.newPage();
                const context = page.context();
                await browserController.newPage();

                expect(context.pages()).toHaveLength(3); // 3 pages because of the about:blank.
            });

            test('should pass launch options to browser', async () => {
                const plugin = new PlaywrightPlugin(playwright[browserName]);

                let ran = false;

                const launchOptions = {
                    logger: {
                        isEnabled: () => {
                            ran = true;

                            return false;
                        },
                        // eslint-disable-next-line @typescript-eslint/no-empty-function
                        log: () => {},
                    },
                };

                const launchContext = plugin.createLaunchContext({ launchOptions });
                browser = await plugin.launch(launchContext);

                expect(ran).toBe(true);
            });

            describe('PlaywrightBrowser', () => {
                test('should create new page', async () => {
                    const plugin = new PlaywrightPlugin(playwright[browserName]);

                    const launchContext = plugin.createLaunchContext();
                    browser = await plugin.launch(launchContext);
                    const page = await browser.newPage();

                    expect(typeof page.close).toBe('function');
                    expect(typeof page.evaluate).toBe('function');
                });

                test('should emit disconnected event on close', async () => {
                    const plugin = new PlaywrightPlugin(playwright[browserName]);

                    const launchContext = plugin.createLaunchContext();
                    browser = await plugin.launch(launchContext);
                    let called = false;

                    browser.on('disconnected', () => {
                        called = true;
                    });

                    await browser.close();

                    expect(called).toBe(true);
                });

                test('should be used only with incognito pages context', async () => {
                    const plugin = new PlaywrightPlugin(playwright[browserName]);

                    const launchContext = plugin.createLaunchContext({ useIncognitoPages: false });
                    browser = await plugin.launch(launchContext);
                    expect(browser).toBeInstanceOf(PlaywrightBrowser);

                    await browser.close();

                    const launchContext2 = plugin.createLaunchContext({ useIncognitoPages: true });
                    browser = await plugin.launch(launchContext2);
                    expect(browser).not.toBeInstanceOf(PlaywrightBrowser);
                });

                test('should return correct version', async () => {
                    const plugin = new PlaywrightPlugin(playwright[browserName]);

                    const launchContext = plugin.createLaunchContext({ useIncognitoPages: false });
                    browser = await plugin.launch(launchContext);
                    const version1 = browser.version();

                    await browser.close();

                    const launchContext2 = plugin.createLaunchContext({ useIncognitoPages: true });
                    browser = await plugin.launch(launchContext2);
                    expect(version1).toEqual(browser.version());
                });

                test('should return all contexts', async () => {
                    const plugin = new PlaywrightPlugin(playwright[browserName]);

                    const launchContext = plugin.createLaunchContext();
                    browser = await plugin.launch(launchContext);
                    const contexts = browser.contexts();
                    expect(contexts).toHaveLength(1);
                    // Cast to any to access private property
                    // eslint-disable-next-line no-underscore-dangle
                    expect(contexts[0]).toEqual((browser as any)._browserContext);
                });

                test('should return correct connected status', async () => {
                    const plugin = new PlaywrightPlugin(playwright[browserName]);

                    const launchContext = plugin.createLaunchContext();
                    browser = await plugin.launch(launchContext);
                    expect(browser.isConnected()).toBe(true);

                    await browser.close();

                    expect(browser.isConnected()).toBe(false);
                });

                test('should throw on newContext call', async () => {
                    const plugin = new PlaywrightPlugin(playwright[browserName]);
                    const launchContext = plugin.createLaunchContext();
                    browser = await plugin.launch(launchContext);

                    await expect(browser.newContext())
                        .rejects
                        .toThrow('Function `newContext()` is not available in incognito mode');
                });

                test('should have same public interface as playwright browserType', async () => {
                    const plugin = new PlaywrightPlugin(playwright[browserName]);
                    const originalFunctionNames = ['close', 'contexts', 'isConnected', 'newContext', 'newPage', 'version'] as const;
                    const launchContext = plugin.createLaunchContext({ useIncognitoPages: true });
                    browser = await plugin.launch(launchContext);

                    for (const originalFunctionName of originalFunctionNames) {
                        expect(typeof browser[originalFunctionName]).toBe('function');
                    }

                    expect.hasAssertions();
                });
            });
        });
    });

    runPluginTest(PlaywrightPlugin, PlaywrightController, playwright.chromium);
    runPluginTest(PlaywrightPlugin, PlaywrightController, playwright.firefox);
    runPluginTest(PlaywrightPlugin, PlaywrightController, playwright.webkit);
});
