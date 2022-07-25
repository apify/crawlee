import { Actor } from 'apify';
import { CheerioCrawler, createCheerioRouter, Dataset } from '@crawlee/cheerio';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

const router = createCheerioRouter();

router.addHandler('START', async ({ enqueueLinks }) => {
    await enqueueLinks({
        label: 'DETAIL',
        globs: ['https://apify.com/apify/web-scraper'],
    });
});

router.addHandler('DETAIL', async ({ request, $ }) => {
    const { url } = request;

    const uniqueIdentifier = url.split('/').slice(-2).join('/');
    const title = $('header h1').text();
    const description = $('header span.actor-description').text();
    const modifiedDate = $('ul.ActorHeader-stats time').attr('datetime');
    const runCount = $('ul.ActorHeader-stats > li:nth-of-type(3)').text().match(/[\d,]+/)[0].replace(/,/g, '');

    await Dataset.pushData({
        url,
        uniqueIdentifier,
        title,
        description,
        modifiedDate: new Date(Number(modifiedDate)),
        runCount: Number(runCount),
    });
});

await Actor.main(async () => {
    const crawler = new CheerioCrawler({
        requestHandler: router,
    });

    await crawler.run([{ url: 'https://apify.com/apify', userData: { label: 'START' } }]);
}, mainOptions);
