import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    postNavigationHooks: [
        async ({ page, handleCloudflareChallenge }) => {
            await handleCloudflareChallenge();

            // After a hook navigates the page (e.g. when solving a challenge),
            // return the new response so downstream code (status-code validation,
            // subsequent hooks, request handler) observes the post-challenge page
            // instead of the original response that triggered the hook.
            const refreshed = await page.reload();

            return refreshed ? { response: refreshed } : undefined;
        },
    ],
    requestHandler: async ({ response }) => {
        console.log(`final status: ${response.status()}`);
    },
});

await crawler.run(['https://example.com']);
