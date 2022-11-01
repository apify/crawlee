/**
 * How to generate the gifs:
 *
 * 1. Set a breakpoint on the marked line
 * 2. Run the crawler with the debugger
 * 3. Setup your chrome and recording
 * 4. Resume, record, ???, profit!
 */

import { PuppeteerCrawler, sleep } from 'crawlee';

const crawler = new PuppeteerCrawler({
    headless: false,
    maxConcurrency: 1,
    navigationTimeoutSecs: 100000,
    requestHandlerTimeoutSecs: 10000,
    browserPoolOptions: {
        closeInactiveBrowserAfterSecs: 100000,
        operationTimeoutSecs: 100000,
    },
    async requestHandler({ request }) {
        if (request.userData.label === 'start') {
            console.log('Waiting 5s, prepare recording!');
            await sleep(5000); // <--- Set breakpoint here
        } else {
            await sleep(250);
        }
    },
});

await crawler.run([
    {
        url: 'https://crawlee.dev',
        userData: { label: 'start' },
        uniqueKey: 'dark-start'
    },
    {
        url: 'https://crawlee.dev/docs/quick-start',
        uniqueKey: 'dark-1'
    },
    {
        url: 'https://crawlee.dev/docs/introduction/setting-up',
        uniqueKey: 'dark-2'
    },
    {
        url: 'https://crawlee.dev/docs/introduction/first-crawler',
        uniqueKey: 'dark-3'
    },
    {
        url: 'https://crawlee.dev/docs/introduction/adding-urls',
        uniqueKey: 'dark-4'
    },
    {
        url: 'https://crawlee.dev/docs/introduction/real-world-project',
        uniqueKey: 'dark-5'
    },

    // Light theme
    {
        url: 'https://crawlee.dev',
        userData: { label: 'start' },
        uniqueKey: 'light th-start'
    },
    {
        url: 'https://crawlee.dev/docs/quick-start',
        uniqueKey: 'light th-1'
    },
    {
        url: 'https://crawlee.dev/docs/introduction/setting-up',
        uniqueKey: 'light th-2'
    },
    {
        url: 'https://crawlee.dev/docs/introduction/first-crawler',
        uniqueKey: 'light th-3'
    },
    {
        url: 'https://crawlee.dev/docs/introduction/adding-urls',
        uniqueKey: 'light th-4'
    },
    {
        url: 'https://crawlee.dev/docs/introduction/real-world-project',
        uniqueKey: 'light th-5'
    }
]);
