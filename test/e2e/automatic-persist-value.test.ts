import { harness, listUserKeys, scenario } from './harness.js';

const { test } = harness();

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

test('automatic-persist-value', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('automatic-persist-value', {
        source: scenario(import.meta.filename, main),
        memory: 4096,
    });
    const result = await runActor(actor);
    const keys = await listUserKeys(result);

    expect(result.status).toBe('SUCCEEDED');
    expect(keys).toEqual(['crawlee']);
    const record = await result.getKeyValueStoreClient().getRecord('crawlee');
    expect(record?.value).toEqual({ crawlee: 'awesome!' });
});
