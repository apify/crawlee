import { CheerioCrawler, ProxyConfiguration } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({
    /* opts */
});

const crawler = new CheerioCrawler({
    proxyConfiguration,
    // ...
});
