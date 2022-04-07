// $ npm run build && node test/request_queue_reset.test-e2e.js

const Apify = require('../build');

// RequestQueue auto-reset when stuck with requests in progress
Apify.main(async () => {
    process.env.APIFY_INTERNAL_TIMEOUT = '30000'; // 30s
    Apify.utils.log.setLevel(Apify.utils.log.LEVELS.DEBUG);
    await Apify.utils.purgeLocalStorage();
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({ url: 'https://example.com/?q=1' });
    await requestQueue.addRequest({ url: 'https://example.com/?q=2' });
    const r3 = await requestQueue.addRequest({ url: 'https://example.com/?q=3' });

    // trigger 0 concurrency by marking one of the requests as already in progress
    requestQueue.inProgress.add(r3.requestId);

    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        handlePageFunction: async (ctx) => {
            Apify.utils.log.info(ctx.request.id);
        },
    });

    await crawler.run();
});
