"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const crawlee_1 = require("crawlee");
const puppeteer_extra_1 = tslib_1.__importDefault(require("puppeteer-extra"));
const puppeteer_extra_plugin_stealth_1 = tslib_1.__importDefault(require("puppeteer-extra-plugin-stealth"));
// First, we tell puppeteer-extra to use the plugin (or plugins) we want.
// Certain plugins might have options you can pass in - read up on their documentation!
puppeteer_extra_1.default.use((0, puppeteer_extra_plugin_stealth_1.default)());
// Create an instance of the PuppeteerCrawler class - a crawler
// that automatically loads the URLs in headless Chrome / Puppeteer.
const crawler = new crawlee_1.PuppeteerCrawler({
    launchContext: {
        // !!! You need to specify this option to tell Crawlee to use puppeteer-extra as the launcher !!!
        launcher: puppeteer_extra_1.default,
        launchOptions: {
            // Other puppeteer options work as usual
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
    async requestHandler({ pushData, request, page, enqueueLinks, log }) {
        log.info(`Processing ${request.url}...`);
        // A function to be evaluated by Puppeteer within the browser context.
        const data = await page.$$eval('.athing', ($posts) => {
            const scrapedData = [];
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
        await pushData(data);
        // Find a link to the next page and enqueue it if it exists.
        const infos = await enqueueLinks({
            selector: '.morelink',
        });
        if (infos.processedRequests.length === 0)
            log.info(`${request.url} is the last page!`);
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
