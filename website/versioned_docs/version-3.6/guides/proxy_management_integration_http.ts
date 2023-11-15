import { HttpCrawler, ProxyConfiguration } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({
    proxyUrls: [
        'http://proxy-1.com',
        'http://proxy-2.com',
    ],
});

const crawler = new HttpCrawler({
    proxyConfiguration,
    // ...
});
