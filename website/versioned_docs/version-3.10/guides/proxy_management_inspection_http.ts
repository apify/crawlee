import { HttpCrawler, ProxyConfiguration } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({ /* opts */ });

const crawler = new HttpCrawler({
    proxyConfiguration,
    async requestHandler({ proxyInfo }) {
        console.log(proxyInfo);
    },
    // ...
});
