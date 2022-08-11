import { JSDOMCrawler, ProxyConfiguration } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({ /* opts */ });

const crawler = new JSDOMCrawler({
    useSessionPool: true,
    persistCookiesPerSession: true,
    proxyConfiguration,
    // ...
});
