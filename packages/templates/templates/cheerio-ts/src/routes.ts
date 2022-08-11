import { createCheerioRouter, Dataset } from 'crawlee';

export const router = createCheerioRouter();

router.addDefaultHandler(async ({ enqueueLinks, log }) => {
    log.info(`Handle Start URLs`);
    await enqueueLinks({
        globs: ['https://crawlee.dev/**'],
        label: 'DETAIL',
    });
});

router.addHandler('LIST', async ({ log }) => {
    log.info(`Handle pagination`);
});

router.addHandler('DETAIL', async ({ request, $, log }) => {
    const title = $('title').text();
    log.info(`Handle details: ${title} [${request.loadedUrl}]`);
    await Dataset.pushData({ url: request.loadedUrl });
});
