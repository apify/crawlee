import { Actor } from 'apify';
import { CheerioCrawler, createCheerioRouter, Dataset } from '@crawlee/cheerio';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

const router = createCheerioRouter();

router.addHandler('START', async ({ enqueueLinks }) => {
    await enqueueLinks({
        label: 'DETAIL',
        globs: ['**/examples/accept-user-input'],
    });
});

router.addHandler('DETAIL', async ({ request, $ }) => {
    const { url } = request;

    const uniqueIdentifier = url.split('/').slice(-2).join('/');
    const title = $('header h1').text();
    const firstParagraph = $('header + p').text();
    const modifiedDate = $('.theme-last-updated time').attr('datetime');

    await Dataset.pushData({
        url,
        uniqueIdentifier,
        title,
        firstParagraph,
        modifiedDate,
    });
});

await Actor.main(async () => {
    const crawler = new CheerioCrawler({
        requestHandler: router,
    });

    await crawler.run([{ url: 'https://crawlee.dev/js/docs/3.12/examples', userData: { label: 'START' } }]);
}, mainOptions);
