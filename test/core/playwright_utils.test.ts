import type { Server } from 'node:http';
import path from 'node:path';

import { KeyValueStore, launchPlaywright, playwrightUtils, Request } from '@crawlee/playwright';
import type { Browser, Locator, Page } from 'playwright';
import { chromium } from 'playwright';
import { runExampleComServer } from 'test/shared/_helper';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

import log from '@apify/log';

let serverAddress = 'http://localhost:';
let port: number;
let server: Server;

const launchContext = { launchOptions: { headless: true } };

beforeAll(async () => {
    [server, port] = await runExampleComServer();
    serverAddress += port;
});

afterAll(() => {
    server.close();
});

describe('playwrightUtils', () => {
    let ll: number;
    const localStorageEmulator = new MemoryStorageEmulator();

    beforeAll(async () => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    beforeEach(async () => {
        await localStorageEmulator.init();
    });

    afterAll(async () => {
        log.setLevel(ll);
        await localStorageEmulator.destroy();
    });

    test('injectFile()', async () => {
        const browser2 = await launchPlaywright(launchContext);
        const survive = async (browser: Browser) => {
            // Survive navigations
            const page = await browser.newPage();
            // @ts-expect-error
            let result = await page.evaluate(() => window.injectedVariable === 42);
            expect(result).toBe(false);
            await playwrightUtils.injectFile(page, path.join(__dirname, '..', 'shared', 'data', 'inject_file.txt'), {
                surviveNavigations: true,
            });
            // @ts-expect-error
            result = await page.evaluate(() => window.injectedVariable);
            expect(result).toBe(42);
            await page.goto('about:chrome');
            // @ts-expect-error
            result = await page.evaluate(() => window.injectedVariable);
            expect(result).toBe(42);
            await page.goto(serverAddress);
            // @ts-expect-error
            result = await page.evaluate(() => window.injectedVariable);
            expect(result).toBe(42);
        };
        const remove = async (browser: Browser) => {
            // Remove with navigations
            const page = await browser.newPage();
            // @ts-expect-error
            let result = await page.evaluate(() => window.injectedVariable === 42);
            expect(result).toBe(false);
            await page.goto('about:chrome');
            // @ts-expect-error
            result = await page.evaluate(() => window.injectedVariable === 42);
            expect(result).toBe(false);
            await playwrightUtils.injectFile(page, path.join(__dirname, '..', 'shared', 'data', 'inject_file.txt'));
            // @ts-expect-error
            result = await page.evaluate(() => window.injectedVariable);
            expect(result).toBe(42);
            await page.goto(serverAddress);
            // @ts-expect-error
            result = await page.evaluate(() => window.injectedVariable === 42);
            expect(result).toBe(false);
        };
        try {
            await Promise.all([survive(browser2), remove(browser2)]);
        } finally {
            await browser2.close();
        }
    });

    test('injectJQuery()', async () => {
        const browser = await launchPlaywright(launchContext);

        try {
            const page = await browser.newPage();
            await page.goto('about:blank');

            // NOTE: Chrome already defines window.$ as alias to document.querySelector(),
            // (https://developers.google.com/web/tools/chrome-devtools/console/command-line-reference#queryselector)
            const result1 = await page.evaluate(() => {
                return {
                    // @ts-expect-error
                    isDefined: window.jQuery !== undefined,
                };
            });
            expect(result1).toEqual({
                isDefined: false,
            });

            await playwrightUtils.injectJQuery(page);

            const result2 = await page.evaluate(() => {
                /* global $ */
                return {
                    // @ts-expect-error
                    isDefined: window.jQuery === window.$,
                    // @ts-expect-error
                    text: $('h1').text(),
                };
            });
            expect(result2).toEqual({
                isDefined: true,
                text: '',
            });

            await page.reload();

            const result3 = await page.evaluate(() => {
                return {
                    // @ts-expect-error
                    isDefined: window.jQuery === window.$,
                    // @ts-expect-error
                    text: $('h1').text(),
                };
            });
            expect(result3).toEqual({
                isDefined: true,
                text: '',
            });
        } finally {
            await browser.close();
        }
    });

    test('parseWithCheerio() works', async () => {
        const browser = await launchPlaywright(launchContext);

        try {
            const page = await browser.newPage();
            await page.goto(serverAddress);
            const $ = await playwrightUtils.parseWithCheerio(page);

            const title = $('h1').text().trim();
            expect(title).toBe('Example Domain');
        } finally {
            await browser.close();
        }
    });

    test('parseWithCheerio() iframe expansion works', async () => {
        const browser = await launchPlaywright(launchContext);

        try {
            const page = await browser.newPage();
            await page.goto(new URL('/special/outside-iframe', serverAddress).toString());

            const $ = await playwrightUtils.parseWithCheerio(page);

            const headings = $('h1')
                .map((_, el) => $(el).text())
                .get();

            const titles = $('title')
                .map((_, el) => $(el).text())
                .get();

            expect(titles).toEqual(['Outside iframe title']);
            expect(headings).toEqual(['Outside iframe', 'In iframe']);
        } finally {
            await browser.close();
        }
    });

    describe('blockRequests()', () => {
        let browser: Browser = null as any;
        beforeAll(async () => {
            browser = await launchPlaywright(launchContext);
        });
        afterAll(async () => {
            await browser.close();
        });

        test('works with default values', async () => {
            const loadedUrls: string[] = [];

            const page = await browser.newPage();
            await playwrightUtils.blockRequests(page);
            page.on('response', (response) => {
                if (response.url() !== `${serverAddress}/special/resources`) {
                    loadedUrls.push(response.url());
                }
            });
            await page.goto(`${serverAddress}/special/resources`, { waitUntil: 'networkidle' });
            expect(loadedUrls).toEqual([`${serverAddress}/script.js`]);
        });

        test('works with overridden values', async () => {
            const loadedUrls: string[] = [];

            const page = await browser.newPage();
            await playwrightUtils.blockRequests(page, {
                urlPatterns: ['.css'],
            });
            page.on('response', (response) => loadedUrls.push(response.url()));
            await page.goto(`${serverAddress}/special/resources`, { waitUntil: 'networkidle' });
            expect(loadedUrls).toEqual(
                expect.arrayContaining([
                    `${serverAddress}/image.png`,
                    `${serverAddress}/script.js`,
                    `${serverAddress}/image.gif`,
                ]),
            );
        });
    });

    test('gotoExtended() works', async () => {
        const browser = await chromium.launch({ headless: true });

        try {
            const page = await browser.newPage();
            const request = new Request({
                url: `${serverAddress}/special/getDebug`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                },
                payload: '{ "foo": "bar" }',
            });

            const response = await playwrightUtils.gotoExtended(page, request);

            const { method, headers, bodyLength } = JSON.parse(await response!.text());
            expect(method).toBe('POST');
            expect(bodyLength).toBe(16);
            expect(headers['content-type']).toBe('application/json; charset=utf-8');
        } finally {
            await browser.close();
        }
    }, 60_000);

    describe('shadow root expansion', () => {
        let browser: Browser;
        beforeAll(async () => {
            browser = await launchPlaywright(launchContext);
        });
        afterAll(async () => {
            await browser.close();
        });

        test('no expansion with ignoreShadowRoots: true', async () => {
            const page = await browser.newPage();
            await page.goto(`${serverAddress}/special/shadow-root`);
            const result = await playwrightUtils.parseWithCheerio(page, true);

            const text = result('body').text().trim();
            expect([...text.matchAll(/\[GOOD\]/g)]).toHaveLength(0);
            expect([...text.matchAll(/\[BAD\]/g)]).toHaveLength(0);
        });

        test('expansion works', async () => {
            const page = await browser.newPage();
            await page.goto(`${serverAddress}/special/shadow-root`);
            const result = await playwrightUtils.parseWithCheerio(page);

            const text = result('body').text().trim();
            expect([...text.matchAll(/\[GOOD\]/g)]).toHaveLength(2);
            expect([...text.matchAll(/\[BAD\]/g)]).toHaveLength(0);
        });
    });

    describe('infiniteScroll()', () => {
        function isAtBottom() {
            return window.innerHeight + window.pageYOffset >= document.body.offsetHeight;
        }

        let browser: Browser;
        beforeAll(async () => {
            browser = await chromium.launch({ headless: true });
        });
        afterAll(async () => {
            await browser.close();
        });

        let page: Page;
        beforeEach(async () => {
            page = await browser.newPage();
            let count = 0;
            const content = Array(1000)
                .fill(null)
                .map(() => {
                    return `<div style="border: 1px solid black">Div number: ${count++}</div>`;
                });
            const contentHTML = `<html><body>${content}</body></html>`;
            await page.setContent(contentHTML);
        });
        afterEach(async () => {
            await page.close();
        });

        test('works', async () => {
            const before = await page.evaluate(isAtBottom);
            expect(before).toBe(false);

            await playwrightUtils.infiniteScroll(page, { waitForSecs: 0 });

            const after = await page.evaluate(isAtBottom);
            expect(after).toBe(true);
        });

        test('maxScrollHeight works', async () => {
            const before = await page.evaluate(isAtBottom);
            expect(before).toBe(false);

            await playwrightUtils.infiniteScroll(page, {
                // waitForSecs: Infinity,
                waitForSecs: Number.POSITIVE_INFINITY,
                maxScrollHeight: 1000,
                stopScrollCallback: async () => true,
            });

            const after = await page.evaluate(isAtBottom);
            // It scrolls to the bottom in the first scroll so this is correct.
            // The test passes because the Infinite waitForSecs is broken by the height requirement.
            // If it didn't, the test would time out.
            expect(after).toBe(true);
        });

        test('stopScrollCallback works', async () => {
            const before = await page.evaluate(isAtBottom);
            expect(before).toBe(false);

            await playwrightUtils.infiniteScroll(page, {
                // waitForSecs: Infinity,
                waitForSecs: Number.POSITIVE_INFINITY,
                stopScrollCallback: async () => true,
            });

            const after = await page.evaluate(isAtBottom);
            expect(after).toBe(true);
        });
    });

    test('saveSnapshot() works', async () => {
        const openKVSSpy = vitest.spyOn(KeyValueStore, 'open');
        const browser = await chromium.launch({ headless: true });

        try {
            const page = await browser.newPage();
            const contentHTML =
                '<html><head></head><body><div style="border: 1px solid black">Div number: 1</div></body></html>';
            await page.setContent(contentHTML);

            const screenshot = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 60 });

            // Test saving both image and html
            const object = { setValue: vitest.fn() };
            openKVSSpy.mockResolvedValue(object as any);
            await playwrightUtils.saveSnapshot(page, {
                key: 'TEST',
                keyValueStoreName: 'TEST-STORE',
                screenshotQuality: 60,
            });

            expect(object.setValue).toBeCalledWith('TEST.jpg', screenshot, { contentType: 'image/jpeg' });
            expect(object.setValue).toBeCalledWith('TEST.html', contentHTML, { contentType: 'text/html' });
            object.setValue.mockReset();

            // Test saving only image
            await playwrightUtils.saveSnapshot(page, { saveHtml: false });

            // Default quality is 50
            const screenshot2 = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 50 });
            expect(object.setValue).toBeCalledWith('SNAPSHOT.jpg', screenshot2, { contentType: 'image/jpeg' });
        } finally {
            await browser.close();
        }
    });


    describe('login()', () => {
        const getLocatorMock = () => {
            const locatorMock = {
                isVisible: vitest.fn().mockResolvedValue(true),
                waitFor: vitest.fn(),
                fill: vitest.fn(),
                click: vitest.fn(),
                first: vitest.fn(),
                or: vitest.fn(),
            };
            locatorMock.first.mockReturnValue(locatorMock);
            locatorMock.or.mockReturnValue(locatorMock);
            return locatorMock;
        };
        type LocatorMock = ReturnType<typeof getLocatorMock>;

        let browser: Browser = null as any;
        beforeAll(async () => {
            browser = await launchPlaywright(launchContext);
        });
        afterAll(async () => {
            await browser.close();
        });

        let page: Page;
        let newLocatorMock: LocatorMock;
        let usernameInputMock: LocatorMock;
        let passwordInputMock: LocatorMock;
        let submitButtonMock: LocatorMock;
        let nextButtonMock: LocatorMock;
        beforeEach(async () => {
            page = await browser.newPage();
            newLocatorMock = getLocatorMock();
            usernameInputMock = getLocatorMock();
            passwordInputMock = getLocatorMock();
            submitButtonMock = getLocatorMock();
            nextButtonMock = getLocatorMock();
            vitest.spyOn(page, 'locator').mockReturnValue(newLocatorMock as unknown as Locator);
            vitest.spyOn(page, 'getByText').mockResolvedValue(newLocatorMock as unknown as Locator);
        });
        afterEach(async () => {
            await page.close();
        });

        // Helper to wait for and fill a field, with error handling
        async function waitAndFill(locator: Locator, value: string, timeoutMs: number, fieldName: string) {
            try {
                await locator.waitFor({ timeout: timeoutMs });
                await locator.fill(value);
            } catch (err) {
                throw new Error(`Failed to fill ${fieldName} field: ${(err as Error).message}`);
            }
        }

        // Helper to call handleCaptcha if provided, with error handling and optional timeout
        async function maybeHandleCaptcha(page: Page, handleCaptcha?: (page: Page) => Promise<void>, captchaTimeoutMs = 30000) {
            if (!handleCaptcha) return;
            try {
                await Promise.race([
                    handleCaptcha(page),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Captcha handler timed out')), captchaTimeoutMs)),
                ]);
            } catch (err) {
                throw new Error(`Captcha handler failed: ${(err as Error).message}`);
            }
        }

        async function performSingleStepLogin({
            page,
            username,
            password,
            locators,
            timeoutMs = 30_000,
            handleCaptcha,
            captchaTimeoutMs = 30000,
        }: {
            page: Page;
            username: string;
            password: string;
            locators: { usernameInput: Locator; passwordInput: Locator; submitButton: Locator; nextButton: Locator };
            timeoutMs: number;
            handleCaptcha?: (page: Page) => Promise<void>;
            captchaTimeoutMs?: number;
        }): Promise<void> {
            const usernameField = locators.usernameInput.first();
            await waitAndFill(usernameField, username, timeoutMs, 'username');
            const passwordField = locators.passwordInput.first();
            await waitAndFill(passwordField, password, timeoutMs, 'password');
            await maybeHandleCaptcha(page, handleCaptcha, captchaTimeoutMs);
            try {
                const submitButton = locators.submitButton.first();
                await submitButton.waitFor({ timeout: timeoutMs });
                await submitButton.click();
            } catch (err) {
                throw new Error(`Failed to click submit button: ${(err as Error).message}`);
            }
            await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
        }

        async function performTwoStepLogin({
            page,
            username,
            password,
            locators,
            timeoutMs = 30_000,
            handleCaptcha,
            captchaTimeoutMs = 30000,
        }: {
            page: Page;
            username: string;
            password: string;
            locators: { usernameInput: Locator; passwordInput: Locator; submitButton: Locator; nextButton: Locator };
            timeoutMs: number;
            handleCaptcha?: (page: Page) => Promise<void>;
            captchaTimeoutMs?: number;
        }): Promise<void> {
            const usernameField = locators.usernameInput.first();
            await waitAndFill(usernameField, username, timeoutMs, 'username');
            try {
                const nextButton = locators.nextButton.first();
                await nextButton.waitFor({ timeout: timeoutMs });
                await nextButton.click();
            } catch (err) {
                throw new Error(`Failed to click next button: ${(err as Error).message}`);
            }
            const passwordField = locators.passwordInput.first();
            await waitAndFill(passwordField, password, timeoutMs, 'password');
            await maybeHandleCaptcha(page, handleCaptcha, captchaTimeoutMs);
            try {
                const submitButton = locators.submitButton.first();
                await submitButton.waitFor({ timeout: timeoutMs });
                await submitButton.click();
            } catch (err) {
                throw new Error(`Failed to click submit button: ${(err as Error).message}`);
            }
            await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
        }

        test('single-step login success', async () => {
            const pageWaitForLoadStateSpy = vitest.spyOn(page, 'waitForLoadState').mockResolvedValue();

            usernameInputMock.isVisible.mockResolvedValue(true);
            // Password is visible in single-step flow
            passwordInputMock.isVisible.mockResolvedValue(true);

            const detectLoginSuccessMock = vitest.fn().mockResolvedValue(true);

            await playwrightUtils.login(page, {
                username: 'testuser',
                password: 'testpass',
                locators: {
                    getUsernameInput: () => usernameInputMock as unknown as Locator,
                    getPasswordInput: () => passwordInputMock as unknown as Locator,
                    getSubmitButton: () => submitButtonMock as unknown as Locator,
                },
                detectLoginSuccess: detectLoginSuccessMock,
            });

            // Verify interactions
            expect(usernameInputMock.fill).toHaveBeenCalledWith('testuser');
            expect(passwordInputMock.fill).toHaveBeenCalledWith('testpass');
            expect(submitButtonMock.click).toHaveBeenCalledTimes(1);
            expect(pageWaitForLoadStateSpy).toHaveBeenCalledWith('networkidle', { timeout: 10_000 });
            expect(detectLoginSuccessMock).toHaveBeenCalledWith(page);
        });

        test('single-step login failure', async () => {
            usernameInputMock.isVisible.mockResolvedValue(true);
            // Password is visible in single-step flow
            passwordInputMock.isVisible.mockResolvedValue(true);

            await expect(
                playwrightUtils.login(page, {
                    username: 'testuser',
                    password: 'wrongpass',
                    locators: {
                        getUsernameInput: () => usernameInputMock as unknown as Locator,
                        getPasswordInput: () => passwordInputMock as unknown as Locator,
                        getSubmitButton: () => submitButtonMock as unknown as Locator,
                    },
                    detectLoginSuccess: async () => false,
                }),
            ).rejects.toThrow('Login failed - success detection heuristic indicates login was not successful');
        });

        test('two-step login success', async () => {
            usernameInputMock.isVisible.mockResolvedValue(true);
            // Password is not visible in two-step flow
            passwordInputMock.isVisible.mockResolvedValue(false);

            await playwrightUtils.login(page, {
                username: 'testuser',
                password: 'testpass',
                locators: {
                    getUsernameInput: () => usernameInputMock as unknown as Locator,
                    getPasswordInput: () => passwordInputMock as unknown as Locator,
                    getSubmitButton: () => submitButtonMock as unknown as Locator,
                    getNextButton: () => nextButtonMock as unknown as Locator,
                },
                detectLoginSuccess: async () => true,
            });

            // Verify interactions
            expect(usernameInputMock.fill).toHaveBeenCalledWith('testuser');
            expect(passwordInputMock.fill).toHaveBeenCalledWith('testpass');
            expect(nextButtonMock.click).toHaveBeenCalledOnce();
            expect(submitButtonMock.click).toHaveBeenCalledOnce();
        });

        test('two-step login failure', async () => {
            usernameInputMock.isVisible.mockResolvedValue(true);
            // Password is not visible in two-step flow
            passwordInputMock.isVisible.mockResolvedValue(false);

            await expect(
                playwrightUtils.login(page, {
                    username: 'testuser',
                    password: 'wrongpass',
                    locators: {
                        getUsernameInput: () => usernameInputMock as unknown as Locator,
                        getPasswordInput: () => passwordInputMock as unknown as Locator,
                        getSubmitButton: () => submitButtonMock as unknown as Locator,
                        getNextButton: () => nextButtonMock as unknown as Locator,
                    },
                    detectLoginSuccess: async () => false,
                }),
            ).rejects.toThrow('Login failed - success detection heuristic indicates login was not successful');
        });

        test('no username input detected', async () => {
            // Mock no username input detected
            usernameInputMock.isVisible.mockResolvedValue(false);

            // Should resolve without error when no username input is detected
            await expect(
                playwrightUtils.login(page, {
                    username: 'testuser',
                    password: 'testpass',
                    locators: {
                        getUsernameInput: () => usernameInputMock as unknown as Locator,
                        getPasswordInput: () => passwordInputMock as unknown as Locator,
                        getSubmitButton: () => submitButtonMock as unknown as Locator,
                    },
                }),
            ).resolves.toBeUndefined();

            // Should not attempt to fill or click anything
            expect(usernameInputMock.fill).not.toHaveBeenCalled();
            expect(passwordInputMock.fill).not.toHaveBeenCalled();
            expect(submitButtonMock.click).not.toHaveBeenCalled();
        });

        test('no password input detected', async () => {
            // Mock no username input detected
            passwordInputMock.fill.mockRejectedValue(new Error('Failed to fill password'));

            // Should resolve without error when no username input is detected
            await expect(
                playwrightUtils.login(page, {
                    username: 'testuser',
                    password: 'testpass',
                    locators: {
                        getUsernameInput: () => usernameInputMock as unknown as Locator,
                        getPasswordInput: () => passwordInputMock as unknown as Locator,
                        getSubmitButton: () => submitButtonMock as unknown as Locator,
                    },
                }),
            ).rejects.toThrow('Failed to fill password');
        });

        test('default locators usage', async () => {
            await playwrightUtils.login(page, {
                username: 'testuser',
                password: 'testpass',
                detectLoginSuccess: async () => true,
            });

            // Verify custom selectors were used
            expect(newLocatorMock.fill).toHaveBeenCalledWith('testuser');
            expect(newLocatorMock.fill).toHaveBeenCalledWith('testpass');
            expect(newLocatorMock.click).toHaveBeenCalled();
            expect(newLocatorMock.or).toHaveBeenCalledTimes(42);
        });

        test('default detectLoginSuccess usage - failure indicator', async () => {
            // Mock failed flow
            newLocatorMock.isVisible.mockImplementation(async () => {
                const callCount = newLocatorMock.isVisible.mock.calls.length;
                if (callCount === 1) return true; // failure indicator visible

                await new Promise((resolve) => setTimeout(resolve, 100));
                return false; // no success indicator
            });

            await expect(
                playwrightUtils.login(page, {
                    username: 'testuser',
                    password: 'wrongpass',
                    locators: {
                        getUsernameInput: () => usernameInputMock as unknown as Locator,
                        getPasswordInput: () => passwordInputMock as unknown as Locator,
                        getSubmitButton: () => submitButtonMock as unknown as Locator,
                    },
                }),
            ).rejects.toThrow('Login failed - success detection heuristic indicates login was not successful');
            expect(newLocatorMock.or).toHaveBeenCalledTimes(32);
        });

        test('default detectLoginSuccess usage - success indicator', async () => {
            // Mock successful flow
            newLocatorMock.isVisible.mockImplementation(async () => {
                const callCount = newLocatorMock.isVisible.mock.calls.length;
                // no failure indicator
                if (callCount === 1) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    return false;
                }
                // success indicator visible
                return true;
            });

            await expect(
                playwrightUtils.login(page, {
                    username: 'testuser',
                    password: 'wrongpass',
                    locators: {
                        getUsernameInput: () => usernameInputMock as unknown as Locator,
                        getPasswordInput: () => passwordInputMock as unknown as Locator,
                        getSubmitButton: () => submitButtonMock as unknown as Locator,
                    },
                }),
            ).resolves.toBeUndefined();
            expect(newLocatorMock.or).toHaveBeenCalledTimes(32);
        });

        test('default detectLoginSuccess usage - path changed', async () => {
            // Neither failure nor success indicator visible
            newLocatorMock.isVisible.mockResolvedValue(false);
            vitest.spyOn(page, 'url').mockResolvedValue('https://example.com/dashboard');

            await expect(
                playwrightUtils.login(page, {
                    username: 'testuser',
                    password: 'wrongpass',
                    locators: {
                        getUsernameInput: () => usernameInputMock as unknown as Locator,
                        getPasswordInput: () => passwordInputMock as unknown as Locator,
                        getSubmitButton: () => submitButtonMock as unknown as Locator,
                    },
                }),
            ).resolves.toBeUndefined();
        });

        test('default detectLoginSuccess usage - path is still login', async () => {
            // Neither failure nor success indicator visible
            newLocatorMock.isVisible.mockResolvedValue(false);
            vitest.spyOn(page, 'url').mockReturnValue('https://example.com/login');

            await expect(
                playwrightUtils.login(page, {
                    username: 'testuser',
                    password: 'wrongpass',
                    locators: {
                        getUsernameInput: () => usernameInputMock as unknown as Locator,
                        getPasswordInput: () => passwordInputMock as unknown as Locator,
                        getSubmitButton: () => submitButtonMock as unknown as Locator,
                    },
                }),
            ).rejects.toThrow('Login failed - success detection heuristic indicates login was not successful');
        });

        // TODO: remove this before merging, it's just for development, testing against 3rd party live website is not a good idea
        test('live website login - SauceDemo', async () => {
            vitest.spyOn(page, 'locator').mockRestore();
            vitest.spyOn(page, 'getByText').mockRestore();

            try {
                // Navigate to SauceDemo - a popular demo site for testing automation
                await page.goto('https://www.saucedemo.com/');

                // Use the login function with known test credentials
                await playwrightUtils.login(page, {
                    username: 'standard_user',
                    password: 'secret_sauce',
                });

                // Verify we successfully logged in by checking for the inventory page
                const currentUrl = page.url();
                expect(currentUrl).toContain('/inventory.html');

                // Also verify the presence of the logout button which indicates successful login
                // First open the menu to make the logout button visible
                const menuButton = page.locator('[id="react-burger-menu-btn"]');
                await menuButton.click();

                const logoutButton = page.locator('[data-test="logout-sidebar-link"]');
                await logoutButton.waitFor({ state: 'visible', timeout: 5000 });

                // Verify we can see the products container
                const productsContainer = page.locator('[data-test="inventory-container"]');
                await productsContainer.waitFor({ state: 'visible', timeout: 5000 });
            } catch (error: unknown) {
                // If the test fails, it might be due to network issues or site changes
                // Log the error but don't fail the entire test suite
                console.warn('SauceDemo login test failed - this might be due to network issues:', error);
                // Re-throw only if it's not a network-related error
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (errorMessage.includes('net::') || errorMessage.includes('timeout')) {
                    console.warn('Skipping SauceDemo test due to network issues');
                    return;
                }
                throw error;
            }
        });

        // TODO: remove this before merging, it's just for development, testing against 3rd party live website is not a good idea
        test('live website login failure - SauceDemo', async () => {
            vitest.spyOn(page, 'locator').mockRestore();
            vitest.spyOn(page, 'getByText').mockRestore();

            try {
                // Navigate to SauceDemo - a popular demo site for testing automation
                await page.goto('https://www.saucedemo.com/');

                await expect(() =>
                    // Use the login function with bad credentials
                    playwrightUtils.login(page, {
                        username: 'standard_user',
                        password: 'bad_password',
                    }),
                ).rejects.toThrowError('Login failed - success detection heuristic indicates login was not successful');
            } catch (error: unknown) {
                // If the test fails, it might be due to network issues or site changes
                // Log the error but don't fail the entire test suite
                console.warn('SauceDemo login test failed - this might be due to network issues:', error);
                // Re-throw only if it's not a network-related error
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (errorMessage.includes('net::') || errorMessage.includes('timeout')) {
                    console.warn('Skipping SauceDemo test due to network issues');
                    return;
                }
                throw error;
            }
        });

        test('login() calls handleCaptcha if provided (single-step)', async () => {
            const handleCaptcha = vitest.fn().mockResolvedValue(undefined);
            usernameInputMock.isVisible.mockResolvedValue(true);
            passwordInputMock.isVisible.mockResolvedValue(true);

            await playwrightUtils.login(page, {
                username: 'testuser',
                password: 'testpass',
                locators: {
                    getUsernameInput: () => usernameInputMock as unknown as Locator,
                    getPasswordInput: () => passwordInputMock as unknown as Locator,
                    getSubmitButton: () => submitButtonMock as unknown as Locator,
                },
                detectLoginSuccess: async () => true,
                handleCaptcha,
            });

            expect(handleCaptcha).toHaveBeenCalledWith(page);
        });

        test('login() fails if handleCaptcha throws', async () => {
            const handleCaptcha = vitest.fn().mockRejectedValue(new Error('Captcha failed to solve'));
            usernameInputMock.isVisible.mockResolvedValue(true);
            passwordInputMock.isVisible.mockResolvedValue(true);

            await expect(
                playwrightUtils.login(page, {
                    username: 'testuser',
                    password: 'testpass',
                    locators: {
                        getUsernameInput: () => usernameInputMock as unknown as Locator,
                        getPasswordInput: () => passwordInputMock as unknown as Locator,
                        getSubmitButton: () => submitButtonMock as unknown as Locator,
                    },
                    detectLoginSuccess: async () => true,
                    handleCaptcha,
                }),
            ).rejects.toThrow('Captcha handler failed: Captcha failed to solve');
        });

        test('login() fails if handleCaptcha times out', async () => {
            const handleCaptcha = vitest.fn().mockImplementation(() => new Promise(() => {})); // never resolves
            usernameInputMock.isVisible.mockResolvedValue(true);
            passwordInputMock.isVisible.mockResolvedValue(true);

            await expect(
                playwrightUtils.login(page, {
                    username: 'testuser',
                    password: 'testpass',
                    locators: {
                        getUsernameInput: () => usernameInputMock as unknown as Locator,
                        getPasswordInput: () => passwordInputMock as unknown as Locator,
                        getSubmitButton: () => submitButtonMock as unknown as Locator,
                    },
                    detectLoginSuccess: async () => true,
                    handleCaptcha,
                    captchaTimeoutMs: 100, // very short timeout
                }),
            ).rejects.toThrow('Captcha handler failed: Captcha handler timed out');
        });
    });
});
