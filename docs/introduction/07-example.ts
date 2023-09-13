import { PlaywrightCrawler, Dataset } from 'crawlee';

const crawler = new PlaywrightCrawler({
    requestHandler: async ({ page, request, enqueueLinks }) => {
        console.log(`Processing: ${request.url}`);
        if (request.label === 'DETAIL') {
            const urlParts = request.url.split('/').slice(-2);
            const modifiedTimestamp = await page.locator('time[datetime]').getAttribute('datetime');
            const runsRow = page.locator('ul.ActorHeader-userMedallion > li').filter({ hasText: 'Runs' });
            const runCountString = await runsRow.textContent();

            const results = {
                url: request.url,
                uniqueIdentifier: urlParts.join('/'),
                owner: urlParts[0],
                title: await page.locator('.ActorHeader-identificator h1').textContent(),
                description: await page.locator('p.ActorHeader-description').textContent(),
                modifiedDate: new Date(Number(modifiedTimestamp)),
                runCount: runCountString?.replace('Runs ', ''),
            };

            // highlight-next-line
            await Dataset.pushData(results);
        } else {
            await page.waitForSelector('.ActorStorePagination-buttons a');
            await enqueueLinks({
                selector: '.ActorStorePagination-buttons a',
                label: 'LIST',
            });
            await page.waitForSelector('div[data-test="actorCard"] a');
            await enqueueLinks({
                selector: 'div[data-test="actorCard"] a',
                // highlight-next-line
                label: 'DETAIL', // <= note the different label
            });
        }
    },

    // Let's limit our crawls to make our tests shorter and safer.
    maxRequestsPerCrawl: 50,
});

await crawler.run(['https://apify.com/store']);
