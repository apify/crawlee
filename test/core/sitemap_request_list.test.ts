import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

import { SitemapRequestList } from '@crawlee/core';
import { sleep } from '@crawlee/utils';
import express from 'express';
import { startExpressAppPromise } from 'test/shared/_helper';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

// Express server for serving sitemaps
let url = 'http://localhost';
let server: Server;

beforeAll(async () => {
    const app = express();

    server = await startExpressAppPromise(app, 0);
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
    let attemptCount = 0;

    app.get('/sitemap-unreliable.xml', async (req, res) => {
        attemptCount += 1;
        if (attemptCount % 2 === 1) {
            res.status(500).end();
            return;
        }

        res.setHeader('content-type', 'text/xml');
        res.write(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '<url>',
                '<loc>http://not-exists.com/</loc>',
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=12&amp;desc=vacation_hawaii</loc>',
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=73&amp;desc=vacation_new_zealand</loc>',
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=74&amp;desc=vacation_newfoundland</loc>',
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=83&amp;desc=vacation_usa</loc>',
                '</url>',
                '</urlset>',
            ].join('\n'),
        );
        res.end();
    });

    app.get('/sitemap.xml', async (req, res) => {
        res.setHeader('content-type', 'text/xml');
        res.write(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '<url>',
                '<loc>http://not-exists.com/</loc>',
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=12&amp;desc=vacation_hawaii</loc>',
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=73&amp;desc=vacation_new_zealand</loc>',
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=74&amp;desc=vacation_newfoundland</loc>',
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=83&amp;desc=vacation_usa</loc>',
                '</url>',
                '</urlset>',
            ].join('\n'),
        );
        res.end();
    });

    app.get('/sitemap-stream.xml', async (req, res) => {
        async function* stream() {
            yield [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=80&amp;desc=vacation_turkey</loc>',
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=80&amp;desc=vacation_mauritius</loc>',
                '</url>',
            ].join('\n');

            await sleep(100);

            yield [
                '<url>',
                '<loc>http://not-exists.com/catalog?item=81&amp;desc=vacation_maledives</loc>',
                '</url>',
                '</urlset>',
            ].join('\n');
        }

        res.setHeader('content-type', 'text/xml');

        await finished(Readable.from(stream()).pipe(res));

        res.end();
    });

    app.get('/sitemap-unreliable-break-off.xml', async (req, res) => {
        attemptCount += 1;
        res.setHeader('content-type', 'text/xml');

        res.write(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '<url>',
                '<loc>http://not-exists.com/</loc>',
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=12&amp;desc=vacation_hawaii</loc>',
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=73&amp;desc=vacation_new_zealand</loc>',
            ].join('\n'),
        );

        if (attemptCount % 2 === 1) {
            res.destroy();
            return;
        }

        res.write(
            [
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=74&amp;desc=vacation_newfoundland</loc>',
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=83&amp;desc=vacation_usa</loc>',
                '</url>',
                '</urlset>',
            ].join('\n'),
        );
        res.end();
    });

    app.get('/sitemap-stream-linger.xml', async (req, res) => {
        async function* stream() {
            yield [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=80&amp;desc=vacation_turkey</loc>',
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=81&amp;desc=vacation_maledives</loc>',
                '</url>',
            ].join('\n');

            await sleep(200);

            yield '</urlset>';
        }

        res.setHeader('content-type', 'text/xml');

        await finished(Readable.from(stream()).pipe(res));

        res.end();
    });

    app.get('/sitemap-index.xml', async (req, res) => {
        res.setHeader('content-type', 'text/xml');
        res.write(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '<sitemap>',
                `<loc>${url}/sitemap-stream-linger.xml</loc>`,
                '</sitemap>',
                '<sitemap>',
                `<loc>${url}/sitemap.xml</loc>`,
                '</sitemap>',
                '</sitemapindex>',
            ].join('\n'),
        );

        res.end();
    });
});

afterAll(async () => {
    server.close();
});

// Storage emulator for persistence
const emulator = new MemoryStorageEmulator();

beforeEach(async () => {
    await emulator.init();
});

afterAll(async () => {
    await emulator.destroy();
});

describe('SitemapRequestList', () => {
    test('requests are available before the sitemap is fully loaded', async () => {
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/sitemap-stream.xml`] });

        while (await list.isEmpty()) {
            await sleep(20);
        }

        await expect(list.isFinished(), 'list should not be finished').resolves.toBe(false);
        await expect(list.isEmpty(), 'list should not be empty').resolves.toBe(false);

        const firstRequest = await list.fetchNextRequest();
        expect(firstRequest).not.toBe(null);

        const secondRequest = await list.fetchNextRequest();
        expect(secondRequest).not.toBe(null);

        const thirdRequest = await list.fetchNextRequest();
        expect(thirdRequest).not.toBe(null);
    });

    test('retry sitemap load on error', async () => {
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/sitemap-unreliable.xml`] });

        for await (const request of list) {
            await list.markRequestHandled(request);
        }

        expect(list.handledCount()).toBe(5);
    });

    test('broken off sitemap load resurrects correctly and does not duplicate / lose requests', async () => {
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/sitemap-unreliable-break-off.xml`] });

        const urls = new Set<string>();

        for await (const request of list) {
            await list.markRequestHandled(request);
            urls.add(request.url);
        }

        expect(list.handledCount()).toBe(5);
        expect(urls).toEqual(
            new Set([
                'http://not-exists.com/',
                'http://not-exists.com/catalog?item=12&desc=vacation_hawaii',
                'http://not-exists.com/catalog?item=73&desc=vacation_new_zealand',
                'http://not-exists.com/catalog?item=74&desc=vacation_newfoundland',
                'http://not-exists.com/catalog?item=83&desc=vacation_usa',
            ]),
        );
    });

    test('teardown works', async () => {
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/sitemap-index.xml`] });

        for await (const request of list) {
            await list.markRequestHandled(request);

            if (list.handledCount() >= 2) {
                await list.teardown();
            }
        }

        expect(list.handledCount()).toBe(2);
        expect(list.isFinished()).resolves.toBe(true);
        expect(list.fetchNextRequest()).resolves.toBe(null);
    });

    test('globs filtering works', async () => {
        const list = await SitemapRequestList.open({
            sitemapUrls: [`${url}/sitemap.xml`],
            globs: ['http://not-exists.com/catalog**'],
        });

        for await (const request of list) {
            await list.markRequestHandled(request);
        }

        expect(list.handledCount()).toBe(4);
    });

    test('regexps filtering works', async () => {
        const list = await SitemapRequestList.open({
            sitemapUrls: [`${url}/sitemap.xml`],
            regexps: [/desc=vacation_new.+/],
        });

        for await (const request of list) {
            await list.markRequestHandled(request);
        }

        expect(list.handledCount()).toBe(2);
    });

    test('exclude filtering works', async () => {
        const list = await SitemapRequestList.open({
            sitemapUrls: [`${url}/sitemap.xml`],
            exclude: [/desc=vacation_new/],
        });

        for await (const request of list) {
            await list.markRequestHandled(request);
        }

        expect(list.handledCount()).toBe(3);
    });

    test('draining the request list between sitemaps', async () => {
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/sitemap-index.xml`] });

        while (await list.isEmpty()) {
            await sleep(20);
        }

        const firstBatch: Request[] = [];

        while (!(await list.isEmpty())) {
            const request = await list.fetchNextRequest();
            firstBatch.push(request);
            await list.markRequestHandled(request);
        }

        expect(firstBatch).toHaveLength(2);

        while (await list.isEmpty()) {
            await sleep(20);
        }

        const secondBatch: Request[] = [];

        while (!(await list.isEmpty())) {
            const request = await list.fetchNextRequest();
            secondBatch.push(request);
            await list.markRequestHandled(request);
        }

        expect(secondBatch).toHaveLength(5);

        expect(list.isFinished()).resolves.toBe(true);
        expect(list.handledCount()).toBe(7);
    });

    test('for..await syntax works with SitemapRequestList', async () => {
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/sitemap-index.xml`] });

        for await (const request of list) {
            await list.markRequestHandled(request);
        }

        expect(list.isFinished()).resolves.toBe(true);
        expect(list.handledCount()).toBe(7);
    });

    test('aborting long sitemap load works', async () => {
        const controller = new AbortController();

        const list = await SitemapRequestList.open({
            sitemapUrls: [`${url}/sitemap-index.xml`],
            signal: controller.signal,
        });

        await sleep(50); // Loads the first sub-sitemap, but not the second
        controller.abort();

        for await (const request of list) {
            await list.markRequestHandled(request);
        }

        expect(list.isFinished()).resolves.toBe(true);
        expect(list.isSitemapFullyLoaded()).toBe(false);
        expect(list.handledCount()).toBe(2);
    });

    test('timeout option works', async () => {
        const list = await SitemapRequestList.open({
            sitemapUrls: [`${url}/sitemap-index.xml`],
            timeoutMillis: 50, // Loads the first sub-sitemap, but not the second
        });

        for await (const request of list) {
            await list.markRequestHandled(request);
        }

        expect(list.isFinished()).resolves.toBe(true);
        expect(list.isSitemapFullyLoaded()).toBe(false);
        expect(list.handledCount()).toBe(2);
    });

    test('resurrection does not resume aborted loading', async () => {
        const options = {
            sitemapUrls: [`${url}/sitemap-index.xml`],
            persistStateKey: 'resurrection-abort',
            timeoutMillis: 50,
        };

        {
            const list = await SitemapRequestList.open(options);

            await sleep(50);

            expect(list.isEmpty()).resolves.toBe(false);
            await list.persistState();
        }

        const newList = await SitemapRequestList.open(options);
        for await (const request of newList) {
            await newList.markRequestHandled(request);
        }

        expect(newList.handledCount()).toBe(2);
    });

    test('processing the whole list', async () => {
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/sitemap.xml`] });
        const requests: Request[] = [];

        await expect(list.isFinished()).resolves.toBe(false);

        while (!(await list.isFinished())) {
            const request = await list.fetchNextRequest();
            await list.markRequestHandled(request);
            requests.push(request);
        }

        await expect(list.isEmpty()).resolves.toBe(true);
        expect(requests.map((it) => it.url)).toEqual([
            'http://not-exists.com/',
            'http://not-exists.com/catalog?item=12&desc=vacation_hawaii',
            'http://not-exists.com/catalog?item=73&desc=vacation_new_zealand',
            'http://not-exists.com/catalog?item=74&desc=vacation_newfoundland',
            'http://not-exists.com/catalog?item=83&desc=vacation_usa',
        ]);

        expect(list.handledCount()).toEqual(5);
    });

    test('processing the whole list with reclaiming', async () => {
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/sitemap.xml`] });
        const requests: Request[] = [];

        await expect(list.isFinished()).resolves.toBe(false);
        let counter = 0;

        while (!(await list.isFinished())) {
            const request = await list.fetchNextRequest();

            if (counter % 2 === 0) {
                await list.markRequestHandled(request);
                requests.push(request);
            } else {
                await list.reclaimRequest(request);
            }

            counter += 1;
        }

        await expect(list.isEmpty()).resolves.toBe(true);
        expect(new Set(requests.map((it) => it.url))).toEqual(
            new Set([
                'http://not-exists.com/',
                'http://not-exists.com/catalog?item=12&desc=vacation_hawaii',
                'http://not-exists.com/catalog?item=73&desc=vacation_new_zealand',
                'http://not-exists.com/catalog?item=74&desc=vacation_newfoundland',
                'http://not-exists.com/catalog?item=83&desc=vacation_usa',
            ]),
        );

        expect(list.handledCount()).toEqual(5);
    });

    test('persists state', async () => {
        const options = { sitemapUrls: [`${url}/sitemap-stream.xml`], persistStateKey: 'some-key' };
        const list = await SitemapRequestList.open(options);

        const firstRequest = await list.fetchNextRequest();
        await list.markRequestHandled(firstRequest);

        await list.persistState();

        const newList = await SitemapRequestList.open(options);
        await expect(newList.isEmpty()).resolves.toBe(false);

        while (!(await newList.isFinished())) {
            const request = await newList.fetchNextRequest();
            await newList.markRequestHandled(request);
        }

        expect(list.handledCount()).toBe(1);
        expect(newList.handledCount()).toBe(2);
    });

    test('state persistence tracks user changes', async () => {
        const options = {
            sitemapUrls: [`${url}/sitemap-stream.xml`],
            persistStateKey: 'persist-user-changes',
        };

        const userDataPayload = { some: 'data' };
        let firstLoadedUrl;

        {
            const list = await SitemapRequestList.open(options);

            const firstRequest = await list.fetchNextRequest();
            firstRequest.userData = userDataPayload;
            firstLoadedUrl = firstRequest.url;

            await list.persistState();
            // simulates a migration in the middle of request processing
        }

        const newList = await SitemapRequestList.open(options);
        const restoredRequest = await newList.fetchNextRequest();

        expect(restoredRequest.url).toEqual(firstLoadedUrl);
        expect(restoredRequest.userData).toEqual(userDataPayload);
    });
});
