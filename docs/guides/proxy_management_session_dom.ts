import { DOMCrawler, ProxyConfiguration } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({ /* opts */ });

const crawler = new DOMCrawler({
    useSessionPool: true,
    persistCookiesPerSession: true,
    proxyConfiguration,
    // ...
});
