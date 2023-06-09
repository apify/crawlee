import { Actor } from 'apify';
import { Dataset, createPlaywrightRouter, PlaywrightCrawler } from '@crawlee/playwright';

await Actor.init({ storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new (await import('@apify/storage-local')).ApifyStorageLocal() : undefined });

// createPlaywrightRouter() is only a helper to get better
// intellisense and typings. You can use Router.create() too.
export const router = createPlaywrightRouter();

// This replaces the request.label === DETAIL branch of the if clause.
router.addHandler('DETAIL', async ({
    request,
    page,
    log,
}) => {
    log.debug(`Extracting data: ${request.url}`);
    const urlParts = request.url.split('/')
        .slice(-2);
    const modifiedTimestamp = await page.locator('time[datetime]')
        .getAttribute('datetime');
    const runsRow = page.locator('ul.ActorHeader-userMedallion > li')
        .filter({ hasText: 'Runs' });
    const runCountString = await runsRow.textContent();

    const results = {
        url: request.url,
        uniqueIdentifier: urlParts.join('/'),
        owner: urlParts[0],
        title: await page.locator('.ActorHeader-identificator h1')
            .textContent(),
        description: await page.locator('p.ActorHeader-description')
            .textContent(),
        modifiedDate: new Date(Number(modifiedTimestamp)),
        runCount: runCountString.replace('Runs ', ''),
    };

    log.info(`Saving data: ${request.url}`);
    await Dataset.pushData(results);
});

// This is a fallback route which will handle the start URL
// as well as the LIST labeled URLs.
router.addDefaultHandler(async ({
    request,
    page,
    enqueueLinks,
    log,
}) => {
    log.debug(`Enqueueing pagination: ${request.url}`);
    await page.waitForSelector('.ActorStorePagination-buttons a');
    await enqueueLinks({
        selector: '.ActorStorePagination-buttons a',
        label: 'LIST',
    });
    log.debug(`Enqueueing actor details: ${request.url}`);
    await page.waitForSelector('div[data-test="actorCard"] a');
    await enqueueLinks({
        selector: 'div[data-test="actorCard"] a',
        label: 'DETAIL', // <= note the different label
    });
});

const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 10, // so the test runs faster
    // Instead of the long requestHandler with
    // if clauses we provide a router instance.
    requestHandler: router,
});

await crawler.run(['https://apify.com/store']);

await Actor.exit({ exit: Actor.isAtHome() });
