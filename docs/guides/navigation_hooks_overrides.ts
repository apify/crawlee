import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    postNavigationHooks: [
        // A hook may optionally return a partial object whose properties are merged into
        // the crawling context, useful for replacing `response` after solving a challenge
        // (or doing any other in-place fix-up). `handleCloudflareChallenge` reloads the
        // page after the challenge clears and returns the fresh `Response`.
        async (context) => ({ response: await context.handleCloudflareChallenge() }),
    ],
    requestHandler: async ({ response }) => {
        console.log(`final status: ${response.status()}`);
    },
});

await crawler.run(['https://example.com']);
