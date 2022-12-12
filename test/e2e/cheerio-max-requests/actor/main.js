import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from '@crawlee/cheerio';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new CheerioCrawler({
        maxRequestsPerCrawl: 10,
        autoscaledPoolOptions: { desiredConcurrency: 2 },
        async requestHandler({ $, request }) {
            const { url, userData: { label } } = request;

            if (label === 'START') {
                const links = $('a.card').toArray().map((item) => $(item).attr('href'));
                for (const link of links) {
                    const actorDetailUrl = `https://crawlee.dev${link}`;
                    await crawler.addRequests([{
                        url: actorDetailUrl,
                        userData: { label: 'DETAIL' },
                    }]);
                }
            } else if (label === 'DETAIL') {
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
            }
        },
    });

    await crawler.run([{ url: 'https://crawlee.dev/docs/examples', userData: { label: 'START' } }]);
}, mainOptions);
