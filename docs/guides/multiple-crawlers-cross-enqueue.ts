import { CheerioCrawler, PlaywrightCrawler, RequestQueue } from 'crawlee';

// The detail crawler's finish check needs its own queue, so we open that queue ourselves.
const detailQueue = await RequestQueue.open({ alias: 'details' });

const listingCrawler = new CheerioCrawler({
    async requestHandler({ extractLinks, enqueueLinks }) {
        // Product pages go to the detail crawler's queue...
        await detailCrawler.addRequests(await extractLinks({ selector: '.product-item > a' }));
        // ...while the next listing page stays in the listing crawler's own.
        await enqueueLinks({ selector: 'a.pagination__next' });
    },
});

const detailCrawler = new PlaywrightCrawler({
    requestManager: detailQueue,
    taskLoopOptions: {
        // An empty queue only means the detail crawler has caught up - the listing crawler may still add more.
        isFinishedFunction: async () => {
            const { status: detailQueueStatus } = await detailQueue.checkReadiness();
            return !listingCrawler.running && detailQueueStatus === 'finished';
        },
    },
    async requestHandler({ request, page, pushData }) {
        await pushData({ url: request.url, title: await page.title() });
    },
});

// The listing crawler goes first: `running` stays `false` until its `run()` is called.
await Promise.all([
    listingCrawler.run(['https://warehouse-theme-metal.myshopify.com/collections/sales']),
    detailCrawler.run(),
]);
