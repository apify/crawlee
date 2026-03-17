import { HttpCrawler, ProxyConfiguration } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({
    /* opts */
});

const crawler = new HttpCrawler({
    persistCookiesPerSession: true,
    proxyConfiguration,
    // ...
});
