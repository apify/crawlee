import { PlaywrightCrawler, KeyValueStore } from 'crawlee';

// Create a key value store for all images we find
const imageStore = await KeyValueStore.open('images');

const crawler = new PlaywrightCrawler({
    async requestHandler({ request, page, sendRequest }) {
        // The request should have the navigation skipped
        if (request.skipNavigation) {
            // Request the image and get its buffer back
            const imageBuffer = await sendRequest({ responseType: 'buffer' });

            // Save the image in the key-value store
            await imageStore.setValue(`${request.userData.key}.png`, imageBuffer);

            // Prevent executing the rest of the code as we do not need it
            return;
        }

        // Get all the image sources in the current page
        const images = await page.$$eval('img', (imgs) => imgs.map((img) => img.src));

        // Add all the urls as requests for the crawler, giving each image a key
        await crawler.addRequests(images.map((url, i) => ({ url, skipNavigation: true, userData: { key: i } })));
    },
});

await crawler.addRequests(['https://crawlee.dev']);

// Run the crawler
await crawler.run();
