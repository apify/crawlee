import { ProxyConfiguration, PuppeteerCrawler } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({/* opts */});

const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    async requestHandler({ proxyInfo }) {
        console.log(proxyInfo);
    },
    // ...
});
