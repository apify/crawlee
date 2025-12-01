import { ProxyConfiguration, SessionPool } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({
    /* opts */
});

const proxyUrl = await proxyConfiguration.newUrl();
