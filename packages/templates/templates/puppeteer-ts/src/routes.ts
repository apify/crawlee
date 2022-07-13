import { Dataset, createPuppeteerRouter } from 'crawlee';

export const router = createPuppeteerRouter();

router.addDefaultHandler(async ({ enqueueLinks, log }) => {
    log.info(`Handle Start URLs`);
    await enqueueLinks({
        globs: ['https://apify.com/*'],
        label: 'DETAIL',
    });
});

router.addHandler('handleList', async ({ log }) => {
    log.info(`Handle pagination`);
});

router.addHandler('handleDetail', async ({ request, page, log }) => {
    const title = await page.title();
    log.info(`Handle details: ${title} [${request.loadedUrl}]`);
    await Dataset.pushData({ url: request.loadedUrl });
});
