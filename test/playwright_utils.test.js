import playwright from 'playwright';
import Apify from '../build/index';
import LocalStorageDirEmulator from './local_storage_dir_emulator';

const { utils: { log } } = Apify;

describe('Apify.utils.playwright', () => {
    let ll;
    let localStorageEmulator;

    beforeAll(async () => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
        localStorageEmulator = new LocalStorageDirEmulator();
    });

    beforeEach(async () => {
        const storageDir = await localStorageEmulator.init();
        Apify.Configuration.getGlobalConfig().set('localStorageDir', storageDir);
    });

    afterAll(async () => {
        log.setLevel(ll);
        await localStorageEmulator.destroy();
    });

    test('gotoExtended() works', async () => {
        const browser = await playwright.chromium.launch({ headless: true });

        try {
            const page = await browser.newPage();
            const request = new Apify.Request({
                url: 'https://api.apify.com/v2/browser-info',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                },
                payload: '{ "foo": "bar" }',
            });

            const response = await Apify.utils.playwright.gotoExtended(page, request);

            const { method, headers, bodyLength } = JSON.parse(await response.text());
            expect(method).toBe('POST');
            expect(bodyLength).toBe(16);
            expect(headers['content-type']).toBe('application/json; charset=utf-8');
        } finally {
            await browser.close();
        }
    }, 60000);
});
