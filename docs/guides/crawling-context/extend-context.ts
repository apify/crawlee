import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    // Runs before navigation, so `$` and `response` are not available here yet.
    extendContext: (context) => ({
        async saveUrl() {
            await context.pushData({ url: context.request.url });
        },
    }),
    async requestHandler({ saveUrl, enqueueLinks }) {
        await saveUrl();
        await enqueueLinks();
    },
});

await crawler.run(['https://crawlee.dev']);
