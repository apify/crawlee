import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

import { MemoryStorageBackend, type Request, serviceLocator, SitemapRequestLoader } from '@crawlee/core';
import { sleep } from '@crawlee/utils';
import express from 'express';
import { startExpressAppPromise } from '../shared/_helper.js';

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

    // `?linger=<ms>` (default 200) holds the response open after the two URL entries, so a test can act
    // while this sub-sitemap is still loading.
    app.get('/sitemap-stream-linger.xml', async (req, res) => {
        const lingerMillis = Number(req.query.linger ?? 200);

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

            await sleep(lingerMillis);

            yield '</urlset>';
        }

        res.setHeader('content-type', 'text/xml');

        await finished(Readable.from(stream()).pipe(res));

        res.end();
    });

    // Index over the lingering sub-sitemap (2 URLs) followed by a plain one (5 URLs).
    app.get('/sitemap-index.xml', async (req, res) => {
        const linger = req.query.linger === undefined ? '' : `?linger=${Number(req.query.linger)}`;

        res.setHeader('content-type', 'text/xml');
        res.write(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '<sitemap>',
                `<loc>${url}/sitemap-stream-linger.xml${linger}</loc>`,
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

// Fresh in-memory storage for each test
beforeEach(async () => {
    serviceLocator.setStorageBackend(new MemoryStorageBackend());
});

describe('SitemapRequestLoader', () => {
    test('requests are available before the sitemap is fully loaded', async () => {
        const list = await SitemapRequestLoader.open({
            sitemapUrls: [`${url}/sitemap-stream.xml`],
            enqueueStrategy: 'all',
        });

        while ((await list.checkReadiness()).status !== 'ready') {
            await sleep(20);
        }

        await expect(list.checkReadiness(), 'list should have a request available').resolves.toEqual({
            status: 'ready',
        });

        const firstRequest = await list.fetchNextRequest();
        expect(firstRequest).not.toBe(null);

        const secondRequest = await list.fetchNextRequest();
        expect(secondRequest).not.toBe(null);

        const thirdRequest = await list.fetchNextRequest();
        expect(thirdRequest).not.toBe(null);
    });

    test('retry sitemap load on error', async () => {
        const list = await SitemapRequestLoader.open({
            sitemapUrls: [`${url}/sitemap-unreliable.xml`],
            enqueueStrategy: 'all',
        });

        for await (const request of list) {
            await list.markRequestAsHandled(request);
        }

        expect(await list.getHandledCount()).toBe(5);
    });

    test('broken off sitemap load resurrects correctly and does not duplicate / lose requests', async () => {
        const list = await SitemapRequestLoader.open({
            sitemapUrls: [`${url}/sitemap-unreliable-break-off.xml`],
            enqueueStrategy: 'all',
        });

        const urls = new Set<string>();

        for await (const request of list) {
            await list.markRequestAsHandled(request);
            urls.add(request.url);
        }

        expect(await list.getHandledCount()).toBe(5);
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
        const list = await SitemapRequestLoader.open({
            sitemapUrls: [`${url}/sitemap-index.xml`],
            enqueueStrategy: 'all',
        });

        for await (const request of list) {
            await list.markRequestAsHandled(request);

            if ((await list.getHandledCount()) >= 2) {
                await list.teardown();
            }
        }

        expect(await list.getHandledCount()).toBe(2);
        await expect(list.checkReadiness()).resolves.toEqual({ status: 'finished' });
        await expect(list.fetchNextRequest()).resolves.toBe(null);
    });

    test('include with globs filtering works', async () => {
        const list = await SitemapRequestLoader.open({
            sitemapUrls: [`${url}/sitemap.xml`],
            include: ['http://not-exists.com/catalog**'],
            enqueueStrategy: 'all',
        });

        for await (const request of list) {
            await list.markRequestAsHandled(request);
        }

        expect(await list.getHandledCount()).toBe(4);
    });

    test('include with regexps filtering works', async () => {
        const list = await SitemapRequestLoader.open({
            sitemapUrls: [`${url}/sitemap.xml`],
            include: [/desc=vacation_new.+/],
            enqueueStrategy: 'all',
        });

        for await (const request of list) {
            await list.markRequestAsHandled(request);
        }

        expect(await list.getHandledCount()).toBe(2);
    });

    test('exclude filtering works', async () => {
        const list = await SitemapRequestLoader.open({
            sitemapUrls: [`${url}/sitemap.xml`],
            exclude: [/desc=vacation_new/],
            enqueueStrategy: 'all',
        });

        for await (const request of list) {
            await list.markRequestAsHandled(request);
        }

        expect(await list.getHandledCount()).toBe(3);
    });

    test('draining the request list between sitemaps', async () => {
        const list = await SitemapRequestLoader.open({
            sitemapUrls: [`${url}/sitemap-index.xml`],
            enqueueStrategy: 'all',
        });

        while ((await list.checkReadiness()).status !== 'ready') {
            await sleep(20);
        }

        const firstBatch: Request[] = [];

        while ((await list.checkReadiness()).status === 'ready') {
            const request = await list.fetchNextRequest();
            firstBatch.push(request!);
            await list.markRequestAsHandled(request!);
        }

        expect(firstBatch).toHaveLength(2);

        while ((await list.checkReadiness()).status !== 'ready') {
            await sleep(20);
        }

        const secondBatch: Request[] = [];

        while ((await list.checkReadiness()).status === 'ready') {
            const request = await list.fetchNextRequest();
            secondBatch.push(request!);
            await list.markRequestAsHandled(request!);
        }

        expect(secondBatch).toHaveLength(5);

        await expect(list.checkReadiness()).resolves.toEqual({ status: 'finished' });
        expect(await list.getHandledCount()).toBe(7);
    });

    test('for..await syntax works with SitemapRequestLoader', async () => {
        const list = await SitemapRequestLoader.open({
            sitemapUrls: [`${url}/sitemap-index.xml`],
            enqueueStrategy: 'all',
        });

        for await (const request of list) {
            await list.markRequestAsHandled(request);
        }

        await expect(list.checkReadiness()).resolves.toEqual({ status: 'finished' });
        expect(await list.getHandledCount()).toBe(7);
    });

    test('aborting long sitemap load works', async () => {
        const controller = new AbortController();

        const list = await SitemapRequestLoader.open({
            // The first sub-sitemap stays open for 5s, so the abort below always lands mid-index.
            sitemapUrls: [`${url}/sitemap-index.xml?linger=5000`],
            signal: controller.signal,
            enqueueStrategy: 'all',
        });

        // Abort once the first sub-sitemap streamed a URL - waiting for that rather than for a fixed duration.
        while ((await list.checkReadiness()).status !== 'ready') {
            await sleep(10);
        }

        controller.abort();

        for await (const request of list) {
            await list.markRequestAsHandled(request);
        }

        await expect(list.checkReadiness()).resolves.toEqual({ status: 'finished' });
        expect(list.isSitemapFullyLoaded()).toBe(false);
        expect(await list.getHandledCount()).toBe(2);
    });

    test('timeout option works', async () => {
        const list = await SitemapRequestLoader.open({
            // The timeout has to fire after the first sub-sitemap streamed its URLs but before it closes;
            // the test then runs for the whole linger, since the abort cannot interrupt an in-flight fetch.
            sitemapUrls: [`${url}/sitemap-index.xml?linger=2000`],
            timeoutMillis: 500,
            enqueueStrategy: 'all',
        });

        for await (const request of list) {
            await list.markRequestAsHandled(request);
        }

        await expect(list.checkReadiness()).resolves.toEqual({ status: 'finished' });
        expect(list.isSitemapFullyLoaded()).toBe(false);
        expect(await list.getHandledCount()).toBe(2);
    });

    test('resurrection does not resume aborted loading', async () => {
        const options = {
            sitemapUrls: [`${url}/sitemap-index.xml?linger=5000`],
            persistStateKey: 'resurrection-abort',
            enqueueStrategy: 'all' as const,
        };

        {
            const controller = new AbortController();
            const list = await SitemapRequestLoader.open({ ...options, signal: controller.signal });

            // Abort while the first sub-sitemap is still streaming, so the state is persisted with the
            // load aborted half-way through the index.
            while ((await list.checkReadiness()).status !== 'ready') {
                await sleep(10);
            }

            controller.abort();
            await list.persistState();
        }

        // Deliberately no signal and no timeout here: only the restored abort flag can stop the second
        // sub-sitemap from being fetched.
        const newList = await SitemapRequestLoader.open(options);
        for await (const request of newList) {
            await newList.markRequestAsHandled(request);
        }

        expect(await newList.getHandledCount()).toBe(2);
    });

    test('processing the whole list', async () => {
        const list = await SitemapRequestLoader.open({ sitemapUrls: [`${url}/sitemap.xml`], enqueueStrategy: 'all' });
        const requests: Request[] = [];

        // The sitemap may still be parsing at this point, so `ready` and `waiting` are both fine here.
        expect((await list.checkReadiness()).status).not.toBe('finished');

        while ((await list.checkReadiness()).status !== 'finished') {
            const request = await list.fetchNextRequest();
            if (!request) break;
            await list.markRequestAsHandled(request);
            requests.push(request);
        }

        await expect(list.checkReadiness()).resolves.toEqual({ status: 'finished' });
        expect(requests.map((it) => it.url)).toEqual([
            'http://not-exists.com/',
            'http://not-exists.com/catalog?item=12&desc=vacation_hawaii',
            'http://not-exists.com/catalog?item=73&desc=vacation_new_zealand',
            'http://not-exists.com/catalog?item=74&desc=vacation_newfoundland',
            'http://not-exists.com/catalog?item=83&desc=vacation_usa',
        ]);

        expect(await list.getHandledCount()).toEqual(5);
    });

    test('persists state', async () => {
        const options = {
            sitemapUrls: [`${url}/sitemap-stream.xml`],
            persistStateKey: 'some-key',
            enqueueStrategy: 'all' as const,
        };
        const list = await SitemapRequestLoader.open(options);

        const firstRequest = await list.fetchNextRequest();
        await list.markRequestAsHandled(firstRequest!);

        await list.persistState();

        const newList = await SitemapRequestLoader.open(options);
        await expect(newList.checkReadiness()).resolves.toEqual({ status: 'ready' });

        while ((await newList.checkReadiness()).status !== 'finished') {
            const request = await newList.fetchNextRequest();
            if (!request) break;
            await newList.markRequestAsHandled(request);
        }

        expect(await list.getHandledCount()).toBe(1);
        expect(await newList.getHandledCount()).toBe(2);
    });

    test("calling `persistState` doesn't throw", async () => {
        const list = await SitemapRequestLoader.open({ sitemapUrls: [`${url}/sitemap.xml`], enqueueStrategy: 'all' });

        for await (const request of list) {
            await list.markRequestAsHandled(request);

            if ((await list.getHandledCount()) >= 2) break;
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
            const list = await SitemapRequestLoader.open(options);

            const firstRequest = await list.fetchNextRequest();
            firstRequest!.userData = userDataPayload;
            firstLoadedUrl = firstRequest!.url;

            await list.persistState();
            // simulates a migration in the middle of request processing
        }

        const newList = await SitemapRequestLoader.open(options);
        const restoredRequest = await newList.fetchNextRequest();

        expect(restoredRequest!.url).toEqual(firstLoadedUrl);
        // `toMatchObject` (not `toEqual`): the request also carries internal `__crawlee` bookkeeping (the stamped strategy).
        expect(restoredRequest!.userData).toMatchObject(userDataPayload);
    });

    async function collectUrls(list: SitemapRequestLoader): Promise<string[]> {
        const urls: string[] = [];
        for await (const request of list) {
            urls.push(request.url);
            await list.markRequestAsHandled(request);
        }
        return urls;
    }

    test('default `same-hostname` strategy drops cross-host URL entries', async () => {
        const list = await SitemapRequestLoader.open({ sitemapUrls: [`${url}/cross-host-content.xml`] });
        expect(await collectUrls(list)).toEqual([`${url}/same-host-page`]);
    });

    test('`enqueueStrategy: all` keeps cross-host URL entries', async () => {
        const cross = url.replace('localhost', '127.0.0.1');
        const list = await SitemapRequestLoader.open({
            sitemapUrls: [`${url}/cross-host-content.xml`],
            enqueueStrategy: 'all',
        });
        expect(new Set(await collectUrls(list))).toEqual(
            new Set([`${url}/same-host-page`, `${cross}/cross-host-page`]),
        );
    });

    test('default `same-hostname` strategy drops cross-host nested sitemaps before fetching them', async () => {
        const list = await SitemapRequestLoader.open({ sitemapUrls: [`${url}/cross-host-index.xml`] });
        // The cross-host nested sitemap is never fetched, so its `child-page` URL is absent.
        expect(await collectUrls(list)).toEqual([]);
    });

    test('`enqueueStrategy: all` follows cross-host nested sitemaps', async () => {
        const cross = url.replace('localhost', '127.0.0.1');
        const list = await SitemapRequestLoader.open({
            sitemapUrls: [`${url}/cross-host-index.xml`],
            enqueueStrategy: 'all',
        });
        expect(await collectUrls(list)).toEqual([`${cross}/child-page`]);
    });

    test('non-http(s) schemes are dropped even with `enqueueStrategy: all`', async () => {
        const list = await SitemapRequestLoader.open({
            sitemapUrls: [`${url}/mixed-scheme.xml`],
            enqueueStrategy: 'all',
        });
        expect(await collectUrls(list)).toEqual([`${url}/ok`]);
    });

    test('the selected enqueue strategy is stamped onto emitted requests', async () => {
        const list = await SitemapRequestLoader.open({ sitemapUrls: [`${url}/cross-host-content.xml`] });
        const request = await list.fetchNextRequest();

        expect(request).not.toBe(null);
        // The strategy is persisted on the request so it keeps being enforced after navigation.
        expect((request as any).enqueueStrategy).toBe('same-hostname');
    });

    test('persistState does not deadlock a backpressured sitemap load', async () => {
        // `maxBufferSize: 1` makes the background loader block on backpressure right after
        // pushing the first URL. Persisting the state at that moment swaps the underlying stream,
        // which used to orphan the pending push and hang the loading indefinitely.
        const list = await SitemapRequestLoader.open({
            sitemapUrls: [`${url}/sitemap.xml`],
            persistStateKey: 'backpressure-persist',
            maxBufferSize: 1,
            enqueueStrategy: 'all',
        });

        // Wait until the first URL is buffered, i.e. the loader is parked on backpressure.
        while ((await list.checkReadiness()).status !== 'ready') {
            await sleep(20);
        }

        await list.persistState();

        const urls = new Set<string>();
        for await (const request of list) {
            await list.markRequestAsHandled(request);
            urls.add(request.url);
        }

        expect(list.isSitemapFullyLoaded()).toBe(true);
        await expect(list.checkReadiness()).resolves.toEqual({ status: 'finished' });
        expect(urls).toEqual(
            new Set([
                'http://not-exists.com/',
                'http://not-exists.com/catalog?item=12&desc=vacation_hawaii',
                'http://not-exists.com/catalog?item=73&desc=vacation_new_zealand',
                'http://not-exists.com/catalog?item=74&desc=vacation_newfoundland',
                'http://not-exists.com/catalog?item=83&desc=vacation_usa',
            ]),
        );
    }, 10_000);
});
