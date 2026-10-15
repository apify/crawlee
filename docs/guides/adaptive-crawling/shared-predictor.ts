import { AdaptivePlaywrightCrawler, KeyValueStore, RenderingTypePredictor } from 'crawlee';

const renderingTypePredictor = new RenderingTypePredictor({
    detectionRatio: 0.1,
    persistenceOptions: {
        keyValueStore: KeyValueStore.open('rendering-predictions'),
    },
});
await renderingTypePredictor.initialize();

const crawler = new AdaptivePlaywrightCrawler({
    renderingTypePredictor,
    async requestHandler({ request, parseWithCheerio, pushData, enqueueLinks }) {
        const $ = await parseWithCheerio('h1');
        await pushData({ url: request.loadedUrl, title: $('h1').text() });
        await enqueueLinks();
    },
});

try {
    await crawler.run(['https://crawlee.dev']);
} finally {
    await renderingTypePredictor.teardown();
}
