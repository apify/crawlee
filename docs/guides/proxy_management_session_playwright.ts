import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({
    /* opts */
});

const crawler = new PlaywrightCrawler({
    saveResponseCookies: true,
    proxyConfiguration,
    // ...
});
