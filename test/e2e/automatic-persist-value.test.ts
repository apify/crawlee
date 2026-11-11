import { testActor } from 'apify-test-tools';

import { listUserKeys, scenario } from './harness.js';

export const main = async () => {
    const { Actor, KeyValueStore } = await import('apify');
    const { BasicCrawler } = await import('@crawlee/basic');

    const mainOptions = { exit: Actor.isAtHome() };

    await Actor.main(async () => {
        const kv = await KeyValueStore.open();

        const crawler = new BasicCrawler({
            async requestHandler() {
                const automaticValue = await kv.getAutoSavedValue('crawlee');

                automaticValue.crawlee = 'awesome!';
            },
        });

        await crawler.run(['https://example.com']);
    }, mainOptions);
};

const actor = scenario('automatic-persist-value', import.meta.filename, main, { memory: 4096 });

testActor(actor, 'persists an auto-saved value to the store', async ({ expect, run }) => {
    const result = await run();
    const keys = await listUserKeys(result);

    expect(result.status).toBe('SUCCEEDED');
    expect(keys).toEqual(['crawlee']);
    const record = await result.getKeyValueStoreClient().getRecord('crawlee');
    expect(record?.value).toEqual({ crawlee: 'awesome!' });
});
