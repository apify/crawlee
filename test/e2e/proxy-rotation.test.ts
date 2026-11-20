import { testActor } from 'apify-test-tools';

import { getStats, scenario, validateDataset } from './harness.js';

export const main = async () => {
    const { Actor } = await import('apify');
    const { Dataset, KeyValueStore, PuppeteerCrawler, Session, SessionPool } = await import('@crawlee/puppeteer');

    await Actor.main(async () => {
        const proxyConfiguration = await Actor.createProxyConfiguration();
        const sessionPool = new SessionPool({
            createSessionFunction: async (opts) =>
                new Session({
                    ...opts?.sessionOptions,
                    maxUsageCount: 1,
                    proxyInfo: await proxyConfiguration!.newProxyInfo(),
                }),
        });

        const crawler = new PuppeteerCrawler({
            sessionPool,
            maxConcurrency: 1,
            async requestHandler({ response }) {
                const { clientIp } = await response.json();

                const presentAlready = await KeyValueStore.getValue(clientIp);
                if (presentAlready) {
                    throw new Error(
                        `The ip address ${clientIp} was already used. Proxy rotation does not work properly.`,
                    );
                }

                await KeyValueStore.setValue(clientIp, true);
                await Dataset.pushData({ clientIp });
            },
        });

        await crawler.run(
            Array.from({ length: 5 }, (_, i) => ({ url: 'https://api.apify.com/v2/browser-info', uniqueKey: `${i}` })),
        );
    });
};

const actor = scenario('proxy-rotation', import.meta.filename, main, { image: 'puppeteer', memory: 16384 });

testActor(actor, 'rotates proxies', async ({ expect, run }) => {
    const result = await run();
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(stats.requestsSucceeded).toBe(5);
    expect(items).toHaveLength(5);
    expect(validateDataset(items, ['clientIp'])).toBe(true);
});
