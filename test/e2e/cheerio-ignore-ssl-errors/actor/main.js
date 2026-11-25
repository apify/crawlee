import { createServer as createHttpsServer } from 'node:https';

import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from '@crawlee/cheerio';
import { generate } from 'selfsigned';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

// Generated on the fly and served locally so the test doesn't depend on badssl.com.
const localhost = [{ name: 'commonName', value: 'localhost' }];
const day = 24 * 60 * 60 * 1000;
const badCerts = {
    'self-signed': await generate(localhost, { keyType: 'ec' }),
    'expired': await generate(localhost, {
        keyType: 'ec',
        notBeforeDate: new Date(Date.now() - 2 * day),
        notAfterDate: new Date(Date.now() - day),
    }),
    'wrong-host': await generate([{ name: 'commonName', value: 'wrong.host.test' }], { keyType: 'ec' }),
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
for (const [name, pems] of Object.entries(badCerts)) {
    const server = createHttpsServer({ key: pems.private, cert: pems.cert });
    badSslUrls.push(`https://127.0.0.1:${await startServer(server, name)}/`);
}

await Actor.main(async () => {
    const crawler = new CheerioCrawler({
        ignoreTlsErrors: true,
        async requestHandler({ $, request, log }) {
            log.info(`Scraping ${request.url}`);
            const title = $('title').text();
            await Dataset.pushData({ url: request.url, title });
        },
    });

    await crawler.run(badSslUrls);

    for (const server of servers) {
        server.close();
        server.closeAllConnections();
    }
}, mainOptions);
