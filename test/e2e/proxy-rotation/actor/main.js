import { Actor } from 'apify';
import { Dataset, KeyValueStore, PuppeteerCrawler, Session, SessionPool } from '@crawlee/puppeteer';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

await Actor.main(async () => {
    const proxyConfiguration = await Actor.createProxyConfiguration();
    const sessionPool = new SessionPool({
        createSessionFunction: async (opts) =>
            new Session({
                ...opts?.sessionOptions,
                maxUsageCount: 1,
                proxyInfo: await proxyConfiguration.newProxyInfo(),
            }),
    });

    const crawler = new PuppeteerCrawler({
        sessionPool,
        maxConcurrency: 1,
        async requestHandler({ response }) {
            const { clientIp } = await response.json();

            const presentAlready = await KeyValueStore.getValue(clientIp);
            if (presentAlready) {
                throw new Error(`The ip address ${clientIp} was already used. Proxy rotation does not work properly.`);
            }

            await KeyValueStore.setValue(clientIp, true);
            await Dataset.pushData({ clientIp });
        },
    });

    await crawler.run(
        Array.from({ length: 5 }, (_, i) => ({ url: 'https://api.apify.com/v2/browser-info', uniqueKey: `${i}` })),
    );
}, mainOptions);
