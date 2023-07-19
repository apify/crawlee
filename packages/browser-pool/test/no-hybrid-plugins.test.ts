import { BrowserPool, PlaywrightPlugin, PuppeteerPlugin } from '@crawlee/browser-pool';
import playwright from 'playwright';
import puppeteer from 'puppeteer';

describe('Hybrid BrowserPool plugins should not be allowed', () => {
    test('mixing Puppeteer with Playwright should throw an error', () => {
        expect(() => new BrowserPool({
            browserPlugins: [new PuppeteerPlugin(puppeteer), new PlaywrightPlugin(playwright.chromium)],
        }),
        ).toThrowError();
    });

    test('providing multiple different Playwright plugins should not throw an error', () => {
        expect(() => new BrowserPool({
            browserPlugins: [new PlaywrightPlugin(playwright.chromium), new PlaywrightPlugin(playwright.firefox)],
        })).not.toThrowError();
    });
});
