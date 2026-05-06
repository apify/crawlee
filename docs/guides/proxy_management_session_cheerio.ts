import { CheerioCrawler, ProxyConfiguration } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({
    /* opts */
});

const crawler = new CheerioCrawler({
    saveResponseCookies: true,
    proxyConfiguration,
    // ...
});
