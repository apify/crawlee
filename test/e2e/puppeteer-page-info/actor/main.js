import { Actor } from 'apify';
import { Dataset, PuppeteerCrawler } from '@crawlee/puppeteer';
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
                    globs: ['**/examples/accept-user-input'], userData: { label: 'DETAIL' },
                });
            }

            if (label === 'DETAIL') {
                const { url } = request;

                const uniqueIdentifier = url.split('/').slice(-2).join('/');

                const titleP = page.$eval('header h1', ((el) => el.textContent));
                const firstParagraphP = page.$eval('header + p', ((el) => el.textContent));
                const modifiedDateP = page.$eval('.theme-last-updated time', (el) => el.getAttribute('datetime'));
                const [
                    title,
                    description,
                    modifiedDate,
                ] = await Promise.all([
                    titleP,
                    firstParagraphP,
                    modifiedDateP,
                ]);

                await Dataset.pushData({ url, uniqueIdentifier, title, description, modifiedDate });
            }
        },
    });

    await crawler.run([{ url: 'https://crawlee.dev/docs/3.0/examples', userData: { label: 'START' } }]);
}, mainOptions);
