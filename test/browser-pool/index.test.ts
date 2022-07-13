import * as modules from '@crawlee/browser-pool';

import { BrowserPool } from '../../packages/browser-pool/src/browser-pool';
import { PuppeteerPlugin } from '../../packages/browser-pool/src/puppeteer/puppeteer-plugin';
import { PlaywrightPlugin } from '../../packages/browser-pool/src/playwright/playwright-plugin';

describe('Exports', () => {
    test('Modules', () => {
        expect(modules.BrowserPool).toEqual(BrowserPool);
        expect(modules.PuppeteerPlugin).toEqual(PuppeteerPlugin);
        expect(modules.PlaywrightPlugin).toEqual(PlaywrightPlugin);
    });
});
