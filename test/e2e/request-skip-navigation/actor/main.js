import { Actor } from 'apify';
import { CheerioCrawler, Dataset, log, Request } from '@crawlee/cheerio';
import { ApifyStorageLocal } from '@apify/storage-local';

log.setLevel(log.LEVELS.DEBUG);

const r1 = new Request({
    url: 'https://example.com/?q=1',
    skipNavigation: true,
    userData: { abc: { def: 'ghi' } },
});

const r2 = new Request({
    url: 'https://example.com/?q=2',
    skipNavigation: true,
});
r2.userData = { xyz: { kjl: 'mno' } };

const r3 = new Request({
    url: 'https://example.com/?q=3',
});

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

// Persisting internal settings of `Request`.
await Actor.main(async () => {
    let requestCounter = 0;
    let navigationCounter = 0;

    const crawler = new CheerioCrawler({
        preNavigationHooks: [() => { navigationCounter++; }],
        async requestHandler({ request }) {
            requestCounter++;
            if (request.skipNavigation) {
                log.info(`Skipping ${request.id}...`);
                return;
            }
            log.info(`Navigating on ${request.id}...`);
        },
    });

    await crawler.run([r1, r2, r3]);

    await Dataset.pushData({ requestCounter, navigationCounter });
}, mainOptions);
