import { Actor, KeyValueStore } from 'apify';
import { ApifyStorageLocal } from '@apify/storage-local';
import { BasicCrawler } from '@crawlee/basic';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const kv = await KeyValueStore.open('test');

    const crawler = new BasicCrawler({
        async requestHandler() {
            const automaticValue = await kv.getAutoSavedValue('crawlee');

            automaticValue.crawlee = 'awesome!';
        },
    });

    await crawler.run(['https://example.com']);
}, mainOptions);
