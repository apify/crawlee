import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { sleep } from '@crawlee/utils';
import { Readable } from 'stream';
import { startExpressAppPromise } from 'test/shared/_helper';
import { finished } from 'stream/promises';
import { SitemapRequestList } from '@crawlee/core';

let url = 'http://localhost';
let server: Server;

beforeAll(async () => {
    const app = express();

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
                '<lastmod>2004-11-23</lastmod>',
                '</url>',
            ].join('\n');

            await sleep(100);

            yield [
                '<url>',
                '<loc>http://not-exists.com/catalog?item=81&amp;desc=vacation_maledives</loc>',
                '<lastmod>2004-11-23</lastmod>',
                '</url>',
                '</urlset>',
            ].join('\n');
        }

        res.setHeader('content-type', 'text/xml');

        await finished(Readable.from(stream()).pipe(res));

        res.end();
    });

    server = await startExpressAppPromise(app, 0);
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    server.close();
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

        await expect(list.fetchNextRequest()).resolves.toBe(null);

        await sleep(100);

        await expect(list.isFinished(), 'list should not be finished').resolves.toBe(false);
        await expect(list.isEmpty(), 'list should not be empty').resolves.toBe(false);

        const secondRequest = await list.fetchNextRequest();
        expect(secondRequest).not.toBe(null);
    });

    test('processing the whole list', async () => {
        const list = await SitemapRequestList.open({ sitemapUrls: [`${url}/sitemap.xml`] });
        const requests: Request[] = [];

        while (await list.isEmpty()) {
            await sleep(20);
        }

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

        while (await list.isEmpty()) {
            await sleep(20);
        }

        await expect(list.isFinished()).resolves.toBe(false);
        let counter = 0;

        while (!(await list.isFinished())) {
            const request = await list.fetchNextRequest();

            if (counter % 2 == 0) {
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
});
