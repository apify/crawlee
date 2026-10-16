import { AdaptivePlaywrightCrawler } from 'crawlee';

const crawler = new AdaptivePlaywrightCrawler({
    renderingTypeDetectionRatio: 0.1,
    async requestHandler({ request, querySelectorOne, pushData, enqueueLinks }) {
        const $title = await querySelectorOne('h1');

        await pushData({
            url: request.loadedUrl,
            title: $title.text(),
        });

        await enqueueLinks();
    },
});

await crawler.run(['https://crawlee.dev']);
