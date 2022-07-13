import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlee/cheerio';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new CheerioCrawler({
        maxRequestsPerCrawl: 10,
        async requestHandler({ $, request }) {
            const { url, userData: { label } } = request;

            if (label === 'START') {
                const links = $('.ActorStoreItem').toArray().map((item) => $(item).attr('href'));
                for (const link of links) {
                    const actorDetailUrl = `https://apify.com${link}`;
                    await crawler.addRequests([{
                        url: actorDetailUrl,
                        userData: { label: 'DETAIL' },
                    }]);
                }
            } else if (label === 'DETAIL') {
                const uniqueIdentifier = url.split('/').slice(-2).join('/');
                const title = $('header h1').text();
                const description = $('header span.actor-description').text();
                const modifiedDate = $('ul.ActorHeader-stats time').attr('datetime');
                const runCount = $('ul.ActorHeader-stats > li:nth-of-type(3)').text().match(/[\d,]+/)[0].replace(/,/g, '');

                await Actor.pushData({
                    url,
                    uniqueIdentifier,
                    title,
                    description,
                    modifiedDate: new Date(Number(modifiedDate)),
                    runCount: Number(runCount),
                });
            }
        },
    });

    await crawler.run([{ url: 'https://apify.com/apify', userData: { label: 'START' } }]);
}, mainOptions);
