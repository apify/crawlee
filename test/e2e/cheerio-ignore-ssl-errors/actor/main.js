import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from '@crawlee/cheerio';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

// The "bad" links from the badssl.com index page, listed here because that page itself is flaky.
const badSslUrls = [
    'https://expired.badssl.com/',
    'https://wrong.host.badssl.com/',
    'https://self-signed.badssl.com/',
    'https://untrusted-root.badssl.com/',
    'https://revoked.badssl.com/',
    'https://pinning-test.badssl.com/',
    'https://client-cert-missing.badssl.com/',
    'https://mixed-script.badssl.com/',
    'https://very.badssl.com/',
    'https://rc4-md5.badssl.com/',
    'https://rc4.badssl.com/',
    'https://3des.badssl.com/',
    'https://null.badssl.com/',
    'https://mozilla-old.badssl.com/',
    'https://dh480.badssl.com/',
    'https://dh512.badssl.com/',
    'https://dh1024.badssl.com/',
    'https://dh-small-subgroup.badssl.com/',
    'https://dh-composite.badssl.com/',
    'https://no-sct.badssl.com/',
    'https://subdomain.preloaded-hsts.badssl.com/',
    'https://superfish.badssl.com/',
    'https://edellroot.badssl.com/',
    'https://dsdtestprovider.badssl.com/',
    'https://preact-cli.badssl.com/',
    'https://webpack-dev-server.badssl.com/',
    'https://captive-portal.badssl.com/',
    'https://mitm-software.badssl.com/',
    'https://sha1-2017.badssl.com/',
    'https://sha1-intermediate.badssl.com/',
    'https://invalid-expected-sct.badssl.com/',
];

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
}, mainOptions);
