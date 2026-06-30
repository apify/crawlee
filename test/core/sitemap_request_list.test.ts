import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

import { type Request, SitemapRequestList } from '@crawlee/core';
import { sleep } from '@crawlee/utils';
import express from 'express';

import { startExpressAppPromise } from '../shared/_helper';
import { MemoryStorageEmulator } from '../shared/MemoryStorageEmulator';

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

    // --- Fixtures for the enqueue-strategy filtering tests ---
    // The server answers on both `localhost` and `127.0.0.1` (distinct hostnames), so the `127.0.0.1`
    // variant is a reachable "cross-host" target — a dropped entry is distinguishable from a failed fetch.

    // urlset mixing a same-host and a cross-host URL entry
    app.get('/cross-host-content.xml', async (req, res) => {
        const cross = url.replace('localhost', '127.0.0.1');
        res.setHeader('content-type', 'text/xml');
        res.end(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                `<url><loc>${url}/same-host-page</loc></url>`,
                `<url><loc>${cross}/cross-host-page</loc></url>`,
                '</urlset>',
            ].join('\n'),
        );
    });

    // sitemap index pointing at a cross-host nested sitemap
    app.get('/cross-host-index.xml', async (req, res) => {
        const cross = url.replace('localhost', '127.0.0.1');
        res.setHeader('content-type', 'text/xml');
        res.end(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                `<sitemap><loc>${cross}/cross-host-child.xml</loc></sitemap>`,
                '</sitemapindex>',
            ].join('\n'),
        );
    });

    // nested sitemap referenced by the cross-host index; its URL appears only if the index is followed
    app.get('/cross-host-child.xml', async (req, res) => {
        const cross = url.replace('localhost', '127.0.0.1');
        res.setHeader('content-type', 'text/xml');
        res.end(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                `<url><loc>${cross}/child-page</loc></url>`,
                '</urlset>',
            ].join('\n'),
        );
    });

    // urlset mixing a valid http URL with non-http(s) schemes
    app.get('/mixed-scheme.xml', async (req, res) => {
        res.setHeader('content-type', 'text/xml');
        res.end(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                `<url><loc>${url}/ok</loc></url>`,
                '<url><loc>mailto:foo@bar.com</loc></url>',
                '<url><loc>javascript:alert(1)</loc></url>',
                '<url><loc>ftp://example.com/file.txt</loc></url>',
                '</urlset>',
            ].join('\n'),
        );
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
        const list = await SitemapRequestList.open({
            sitemapUrls: [`${url}/sitemap-stream.xml`],
            enqueueStrategy: 'all',
        });

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
        const list = await SitemapRequestList.open({
            sitemapUrls: [`${url}/sitemap-unreliable.xml`],
            enqueueStrategy: 'all',
        });

        for await (const request of list) {
            await list.markRequestHandled(request);
        }

        expect(list.handledCount()).toBe(5);
    });

    test('broken off sitemap load resurrects correctly and does not duplicate / lose requests', async () => {
        const list = await SitemapRequestList.open({
            sitemapUrls: [`${url}/sitemap-unreliable-break-off.xml`],
            enqueueStrategy: 'all',
        });

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
        const list = await SitemapRequestList.open({
            sitemapUrls: [`${url}/sitemap-index.xml`],
            enqueueStrategy: 'all',
        });

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
            enqueueStrategy: 'all',
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
            enqueueStrategy: 'all',
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
            enqueueStrategy: 'all',
        });

        for await (const request of list) {
            await list.markRequestHandled(request);
        }

        expect(list.handledCount()).toBe(3);
    });

    test('draining the request list between sitemaps', async () => {
        const list = await SitemapRequestList.open({
            sitemapUrls: [`${url}/sitemap-index.xml`],
            enqueueStrategy: 'all',
        });

        while (await list.isEmpty()) {
            await sleep(20);
        }

        const firstBatch: Request[] = [];

        while (!(await list.isEmpty())) {
            const request = await list.fetchNextRequest();
            firstBatch.push(request!);
            await list.markRequestHandled(request!);
        }

        expect(firstBatch).toHaveLength(2);

        while (await list.isEmpty()) {
            await sleep(20);
        }

        const secondBatch: Request[] = [];

        while (!(await list.isEmpty())) {
            const request = await list.fetchNextRequest();
            secondBatch.push(request!);
            await list.markRequestHandled(request!);
        }

        expect(secondBatch).toHaveLength(5);

        expect(list.isFinished()).resolves.toBe(true);
        expect(list.handledCount()).toBe(7);
    });

    test('for..await syntax works with SitemapRequestList', async () => {
        const list = await SitemapRequestList.open({
            sitemapUrls: [`${url}/sitemap-index.xml`],
            enqueueStrategy: 'all',
        });

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
            enqueueStrategy: 'all',
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
            enqueueStrategy: 'all',
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
            enqueueStrategy: 'all' as const,
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
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/sitemap.xml`], enqueueStrategy: 'all' });
        const requests: Request[] = [];

        await expect(list.isFinished()).resolves.toBe(false);

        while (!(await list.isFinished())) {
            const request = await list.fetchNextRequest();
            await list.markRequestHandled(request!);
            requests.push(request!);
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
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/sitemap.xml`], enqueueStrategy: 'all' });
        const requests: Request[] = [];

        await expect(list.isFinished()).resolves.toBe(false);
        let counter = 0;

        while (!(await list.isFinished())) {
            const request = await list.fetchNextRequest();

            if (counter % 2 === 0) {
                await list.markRequestHandled(request!);
                requests.push(request!);
            } else {
                await list.reclaimRequest(request!);
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
        const options = {
            sitemapUrls: [`${url}/sitemap-stream.xml`],
            persistStateKey: 'some-key',
            enqueueStrategy: 'all' as const,
        };
        const list = await SitemapRequestList.open(options);

        const firstRequest = await list.fetchNextRequest();
        await list.markRequestHandled(firstRequest!);

        await list.persistState();

        const newList = await SitemapRequestList.open(options);
        await expect(newList.isEmpty()).resolves.toBe(false);

        while (!(await newList.isFinished())) {
            const request = await newList.fetchNextRequest();
            await newList.markRequestHandled(request!);
        }

        expect(list.handledCount()).toBe(1);
        expect(newList.handledCount()).toBe(2);
    });

    test("calling `persistState` doesn't throw", async () => {
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/sitemap.xml`], enqueueStrategy: 'all' });

        for await (const request of list) {
            await list.markRequestHandled(request);

            if (list.handledCount() >= 2) break;
        }

        await expect(list.persistState()).resolves.toBe(undefined);
    });

    test('state persistence tracks user changes', async () => {
        const options = {
            sitemapUrls: [`${url}/sitemap-stream.xml`],
            persistStateKey: 'persist-user-changes',
            enqueueStrategy: 'all' as const,
        };

        const userDataPayload = { some: 'data' };
        let firstLoadedUrl;

        {
            const list = await SitemapRequestList.open(options);

            const firstRequest = await list.fetchNextRequest();
            firstRequest!.userData = userDataPayload;
            firstLoadedUrl = firstRequest!.url;

            await list.persistState();
            // simulates a migration in the middle of request processing
        }

        const newList = await SitemapRequestList.open(options);
        const restoredRequest = await newList.fetchNextRequest();

        expect(restoredRequest!.url).toEqual(firstLoadedUrl);
        // `toMatchObject` (not `toEqual`): the request also carries internal `__crawlee` bookkeeping (the stamped strategy).
        expect(restoredRequest!.userData).toMatchObject(userDataPayload);
    });

    async function collectUrls(list: SitemapRequestList): Promise<string[]> {
        const urls: string[] = [];
        for await (const request of list) {
            urls.push(request.url);
            await list.markRequestHandled(request);
        }
        return urls;
    }

    test('default `same-hostname` strategy drops cross-host URL entries', async () => {
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/cross-host-content.xml`] });
        expect(await collectUrls(list)).toEqual([`${url}/same-host-page`]);
    });

    test('`enqueueStrategy: all` keeps cross-host URL entries', async () => {
        const cross = url.replace('localhost', '127.0.0.1');
        const list = await SitemapRequestList.open({
            sitemapUrls: [`${url}/cross-host-content.xml`],
            enqueueStrategy: 'all',
        });
        expect(new Set(await collectUrls(list))).toEqual(
            new Set([`${url}/same-host-page`, `${cross}/cross-host-page`]),
        );
    });

    test('default `same-hostname` strategy drops cross-host nested sitemaps before fetching them', async () => {
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/cross-host-index.xml`] });
        // The cross-host nested sitemap is never fetched, so its `child-page` URL is absent.
        expect(await collectUrls(list)).toEqual([]);
    });

    test('`enqueueStrategy: all` follows cross-host nested sitemaps', async () => {
        const cross = url.replace('localhost', '127.0.0.1');
        const list = await SitemapRequestList.open({
            sitemapUrls: [`${url}/cross-host-index.xml`],
            enqueueStrategy: 'all',
        });
        expect(await collectUrls(list)).toEqual([`${cross}/child-page`]);
    });

    test('non-http(s) schemes are dropped even with `enqueueStrategy: all`', async () => {
        const list = await SitemapRequestList.open({
            sitemapUrls: [`${url}/mixed-scheme.xml`],
            enqueueStrategy: 'all',
        });
        expect(await collectUrls(list)).toEqual([`${url}/ok`]);
    });

    test('the selected enqueue strategy is stamped onto emitted requests', async () => {
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/cross-host-content.xml`] });
        const request = await list.fetchNextRequest();

        expect(request).not.toBe(null);
        // The strategy is persisted on the request so it keeps being enforced after navigation.
        expect((request as any).enqueueStrategy).toBe('same-hostname');
    });
});
