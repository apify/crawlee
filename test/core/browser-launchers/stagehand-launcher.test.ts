import { stagehandBrowserPool } from '@crawlee/stagehand';
import puppeteer from 'puppeteer';

describe('Stagehand CDP attachment', () => {
    test('disconnects from an attached browser without closing it', async () => {
        const external = await puppeteer.launch({ headless: true });
        const pool = stagehandBrowserPool({
            useFingerprints: false,
            launchContext: {
                launchOptions: {
                    cdpUrl: external.wsEndpoint(),
                    // Attaching must not attempt to launch another browser.
                    executablePath: '/does-not-exist/crawlee-cdp-test',
                },
            },
            // No LLM operation is called; this only satisfies model configuration.
            stagehandOptions: { env: 'LOCAL', apiKey: 'test-api-key', verbose: 0 },
        });

        try {
            const page = await pool.newPage();
            const attached = page.context().browser()!;
            await page.goto('data:text/html,<title>Attached browser</title>');
            expect(await page.title()).toBe('Attached browser');
            await page.close();

            await pool.destroy();

            expect(attached.isConnected()).toBe(false);
            expect(external.connected).toBe(true);
            const retainedPage = await external.newPage();
            await retainedPage.goto('data:text/html,<title>Still running</title>');
            expect(await retainedPage.title()).toBe('Still running');
        } finally {
            await pool.destroy();
            await external.close();
        }
    });
});
