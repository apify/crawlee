import playwright from 'playwright';
import express from 'express';
import Apify from '../build/index';
import LocalStorageDirEmulator from './local_storage_dir_emulator';
import { startExpressAppPromise } from './_helper';

const { utils: { log } } = Apify;

const HOSTNAME = '127.0.0.1';
let port;
let server;
beforeAll(async () => {
    const app = express();

    app.get('/getRawHeaders', (req, res) => {
        res.send(JSON.stringify(req.rawHeaders));
    });

    app.all('/foo', (req, res) => {
        res.json({
            headers: req.headers,
            method: req.method,
            bodyLength: +req.headers['content-length'] || 0,
        });
    });

    server = await startExpressAppPromise(app, 0);
    port = server.address().port; //eslint-disable-line
});

afterAll(() => {
    server.close();
});

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
                url: `http://${HOSTNAME}:${port}/foo`,
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
