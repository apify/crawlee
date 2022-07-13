import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        preNavigationHooks: [(_ctx, goToOptions) => {
            goToOptions.waitUntil = ['networkidle2'];
        }],
        async requestHandler({ page, enqueueLinks, request }) {
            const { userData: { label } } = request;

            if (label === 'START') {
                await enqueueLinks({
                    globs: [{ glob: 'https://apify.com/apify/web-scraper', userData: { label: 'DETAIL' } }],
                });
            }

            if (label === 'DETAIL') {
                const { url } = request;

                const uniqueIdentifier = url.split('/').slice(-2).join('/');

                const titleP = page.$eval('header h1', ((el) => el.textContent));
                const descriptionP = page.$eval('header span.actor-description', ((el) => el.textContent));
                const modifiedTimestampP = page.$eval('ul.ActorHeader-stats time', (el) => el.getAttribute('datetime'));
                const runCountTextP = page.$eval('ul.ActorHeader-stats > li:nth-of-type(3)', ((el) => el.textContent));
                const [
                    title,
                    description,
                    modifiedTimestamp,
                    runCountText,
                ] = await Promise.all([
                    titleP,
                    descriptionP,
                    modifiedTimestampP,
                    runCountTextP,
                ]);

                const modifiedDate = new Date(Number(modifiedTimestamp));
                const runCount = Number(runCountText.match(/[\d,]+/)[0].replace(/,/g, ''));

                await Actor.pushData({ url, uniqueIdentifier, title, description, modifiedDate, runCount });
            }
        },
    });

    await crawler.run([{ url: 'https://apify.com/store', userData: { label: 'START' } }]);
}, mainOptions);
