import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    postNavigationHooks: [
        async ({ response, handleCloudflareChallenge, log }) => {
            // 403 when the page is a Cloudflare challenge
            log.info(`Navigation response: ${response?.status()}`);

            const solved = await handleCloudflareChallenge();
            // Replace `response` on the context, but only when a challenge was actually solved.
            // `{ response: undefined }` would overwrite the navigation response.
            return solved && { response: solved };
        },
    ],
    async requestHandler({ response, log }) {
        // 200 - the response the hook returned
        log.info(`Request handler response: ${response?.status()}`);
    },
});

await crawler.run(['https://crawlee.dev']);
