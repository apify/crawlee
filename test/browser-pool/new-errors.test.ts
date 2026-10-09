import { BrowserLaunchError, BrowserPool, PuppeteerPlugin } from '@crawlee/browser-pool';
import puppeteer from 'puppeteer';

describe('New errors in BrowserPool', () => {
    const pool = new BrowserPool({
        browserPlugins: [new PuppeteerPlugin(puppeteer, { launchOptions: { executablePath: '/dev/null' } })],
    });

    afterEach(() => {
        delete process.env.APIFY_IS_AT_HOME;
    });

    test('they should log more information', async () => {
        const error = await pool.newPage().catch((err) => err);

        expect(error).toBeInstanceOf(BrowserLaunchError);

        // Must include the executable path
        expect(error.message).toMatch(/\/dev\/null/);
        // Must include the install command
        expect(error.message).toMatch(/npx @puppeteer\/browsers/);
    });

    test('when running on Apify, it should also log Docker image suggestion', async () => {
        process.env.APIFY_IS_AT_HOME = '1';

        const error = await pool.newPage().catch((err) => err);

        expect(error).toBeInstanceOf(BrowserLaunchError);

        // Must include the executable path
        expect(error.message).toMatch(/\/dev\/null/);
        // Must include the docker image suggestion
        expect(error.message).toMatch(/apify\/actor-node-puppeteer-chrome/);
        // Must include the install command
        expect(error.message).toMatch(/npx @puppeteer\/browsers/);
    });
});
