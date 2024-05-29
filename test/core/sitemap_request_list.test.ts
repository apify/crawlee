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

        await expect(list.isFinished(), 'list should not be finished').resolves.toBeFalsy();
        await expect(list.isEmpty(), 'list should not be empty').resolves.toBeFalsy();

        const firstRequest = await list.fetchNextRequest();
        expect(firstRequest).not.toBeNull();

        await expect(list.fetchNextRequest()).resolves.toBeNull();

        await sleep(100);

        await expect(list.isFinished(), 'list should not be finished').resolves.toBeFalsy();
        await expect(list.isEmpty(), 'list should not be empty').resolves.toBeFalsy();

        const secondRequest = await list.fetchNextRequest();
        expect(secondRequest).not.toBeNull();
    });
});
