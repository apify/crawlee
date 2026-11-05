import { CheerioCrawler, RequestList } from 'crawlee';

// A static list of URLs to start from.
const requestList = await RequestList.open('my-list', ['https://crawlee.dev/', 'https://crawlee.dev/docs']);

// `toTandem()` is a shortcut that pairs the loader with a request queue.
// Without arguments it opens the default `RequestQueue`.
const requestManager = await requestList.toTandem();

const crawler = new CheerioCrawler({
    requestManager,
    async requestHandler({ enqueueLinks }) {
        await enqueueLinks();
    },
});

await crawler.run();
