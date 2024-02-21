import { Dataset, PlaywrightCrawler } from 'crawlee';

// For playwright-extra you will need to import the browser type itself that you want to use!
// By default, PlaywrightCrawler uses chromium, but you can also use firefox or webkit.
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

// First, we tell playwright-extra to use the plugin (or plugins) we want.
// Certain plugins might have options you can pass in - read up on their documentation!
chromium.use(stealthPlugin());

// Create an instance of the PlaywrightCrawler class - a crawler
// that automatically loads the URLs in headless Chrome / Playwright.
const crawler = new PlaywrightCrawler({
    launchContext: {
        // !!! You need to specify this option to tell Crawlee to use playwright-extra as the launcher !!!
        launcher: chromium,
        launchOptions: {
            // Other playwright options work as usual
            headless: true,
        },
    },

    // Stop crawling after several pages
    maxRequestsPerCrawl: 50,

    // This function will be called for each URL to crawl.
    // Here you can write the Puppeteer scripts you are familiar with,
    // with the exception that browsers and pages are automatically managed by Crawlee.
    // The function accepts a single parameter, which is an object with the following fields:
    // - request: an instance of the Request class with information such as URL and HTTP method
    // - page: Puppeteer's Page object (see https://pptr.dev/#show=api-class-page)
    async requestHandler({ request, page, enqueueLinks, log }) {
        log.info(`Processing ${request.url}...`);

        // A function to be evaluated by Puppeteer within the browser context.
        const data = await page.$$eval('.athing', ($posts) => {
            const scrapedData: { title: string; rank: string; href: string }[] = [];

            // We're getting the title, rank and URL of each post on Hacker News.
            $posts.forEach(($post) => {
                scrapedData.push({
                    title: $post.querySelector('.title a').innerText,
                    rank: $post.querySelector('.rank').innerText,
                    href: $post.querySelector('.title a').href,
                });
            });

            return scrapedData;
        });

        // Store the results to the default dataset.
        await Dataset.pushData(data);

        // Find a link to the next page and enqueue it if it exists.
        const infos = await enqueueLinks({
            selector: '.morelink',
        });

        if (infos.processedRequests.length === 0) log.info(`${request.url} is the last page!`);
    },

    // This function is called if the page processing failed more than maxRequestRetries+1 times.
    failedRequestHandler({ request, log }) {
        log.error(`Request ${request.url} failed too many times.`);
    },
});

await crawler.addRequests(['https://news.ycombinator.com/']);

// Run the crawler and wait for it to finish.
await crawler.run();

console.log('Crawler finished.');
