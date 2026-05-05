import { PuppeteerCrawler, ProxyConfiguration } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({
    /* opts */
});

const crawler = new PuppeteerCrawler({
    saveResponseCookies: true,
    proxyConfiguration,
    // ...
});
