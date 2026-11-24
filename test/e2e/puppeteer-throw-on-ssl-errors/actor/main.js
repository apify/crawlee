import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';

import { Actor } from 'apify';
import { Dataset, PuppeteerCrawler } from '@crawlee/puppeteer';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

// Served locally so the test doesn't depend on badssl.com, the key is a throwaway used only by these certificates.
const key = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgsi7NAQ42jitjIdsf
22fLg2gN9JuzCjKfCRgBz34tXNGhRANCAAQd4WdWERyvy8U6fyEOXlkt7GoZHwtD
OVcKDwNOWztsxRwtNtRmvp1fI0uYJ5PqmQbOPfAV2GNRdWkj+gXUiDeS
-----END PRIVATE KEY-----`;

const badCerts = {
    'self-signed': `-----BEGIN CERTIFICATE-----
MIIBejCCASCgAwIBAgIUBSeuqLAnIMMvZa93ujV9pR3u/m8wCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTEyNDA3MjEzM1oYDzIxMjYxMDMx
MDcyMTMzWjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAAQd4WdWERyvy8U6fyEOXlkt7GoZHwtDOVcKDwNOWztsxRwtNtRmvp1f
I0uYJ5PqmQbOPfAV2GNRdWkj+gXUiDeSo04wTDAdBgNVHQ4EFgQUpPozw7c0694R
tLi+4UFrzghyAyMwDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhv
c3SHBH8AAAEwCgYIKoZIzj0EAwIDSAAwRQIhAO0C3eHmFeXYSVj54eJYAlWd5E1y
lF5oa1EqE7LsaomRAiAtz8YtzK1KcKjPjxjIy0lDRiNDrgEwyt57BMk1jlGjjQ==
-----END CERTIFICATE-----`,
    'expired': `-----BEGIN CERTIFICATE-----
MIIBeTCCAR6gAwIBAgIUHdGVmOOlFthAJVqjPyLVK+opuLowCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTIwMDEwMTAwMDAwMFoXDTIwMDEwMjAw
MDAwMFowFDESMBAGA1UEAwwJbG9jYWxob3N0MFkwEwYHKoZIzj0CAQYIKoZIzj0D
AQcDQgAEHeFnVhEcr8vFOn8hDl5ZLexqGR8LQzlXCg8DTls7bMUcLTbUZr6dXyNL
mCeT6pkGzj3wFdhjUXVpI/oF1Ig3kqNOMEwwHQYDVR0OBBYEFKT6M8O3NOveEbS4
vuFBa84IcgMjMA8GA1UdEwEB/wQFMAMBAf8wGgYDVR0RBBMwEYIJbG9jYWxob3N0
hwR/AAABMAoGCCqGSM49BAMCA0kAMEYCIQDICvaNVjd8vsXb5n42nzkgDTC56UXE
uzo3yss/cowxugIhAMfxiVcVfRIg9BMz8kYv5oOPkSSffZsa6uXBsVN/s3nA
-----END CERTIFICATE-----`,
    'wrong-host': `-----BEGIN CERTIFICATE-----
MIIBhjCCASygAwIBAgIUaqtVqGC1/kDegkT8l9deqJ5RI58wCgYIKoZIzj0EAwIw
GjEYMBYGA1UEAwwPd3JvbmcuaG9zdC50ZXN0MCAXDTI2MTEyNDA4MDYyM1oYDzIx
MjYxMDMxMDgwNjIzWjAaMRgwFgYDVQQDDA93cm9uZy5ob3N0LnRlc3QwWTATBgcq
hkjOPQIBBggqhkjOPQMBBwNCAAQd4WdWERyvy8U6fyEOXlkt7GoZHwtDOVcKDwNO
WztsxRwtNtRmvp1fI0uYJ5PqmQbOPfAV2GNRdWkj+gXUiDeSo04wTDAdBgNVHQ4E
FgQUpPozw7c0694RtLi+4UFrzghyAyMwDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREE
EzARgg93cm9uZy5ob3N0LnRlc3QwCgYIKoZIzj0EAwIDSAAwRQIhAIi2381HT/Ag
Lu8n+EJ3gMh/mBUSMJI6yZJ86zdTXnMwAiBgs2vy5lAaM0qbL54opa+jSjPBSpRC
gL4DP9Jmf16iag==
-----END CERTIFICATE-----`,
};

const servers = [];

async function startServer(server, title) {
    server.on('request', (_req, res) => {
        res.setHeader('content-type', 'text/html');
        res.end(`<html><head><title>${title}</title></head><body></body></html>`);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    return server.address().port;
}

const badSslUrls = [];
for (const [name, cert] of Object.entries(badCerts)) {
    badSslUrls.push(`https://127.0.0.1:${await startServer(createHttpsServer({ key, cert }), name)}/`);
}
const validUrl = `http://127.0.0.1:${await startServer(createHttpServer(), 'valid')}/`;

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        launchContext: { launchOptions: { acceptInsecureCerts: false } }, // This is the default
        preNavigationHooks: [
            ({ gotoOptions }) => {
                gotoOptions.waitUntil = ['networkidle2'];
            },
        ],
        async requestHandler({ page, request, log }) {
            log.info(`Scraping ${request.url}`);
            const title = await page.title();
            await Dataset.pushData({ url: request.url, title });
        },
    });

    await crawler.run([...badSslUrls, validUrl]);

    for (const server of servers) {
        server.close();
        server.closeAllConnections();
    }
}, mainOptions);
