import { JSDOMCrawler, log } from 'crawlee';

// Create an instance of the JSDOMCrawler class - crawler that automatically 
// loads the URLs and parses their HTML using the jsdom library.
const crawler = new JSDOMCrawler({
    // Setting the `runScripts` option to `true` allows the crawler to execute client-side 
    // JavaScript code on the page. This is required for some websites (such as the React application in this example), but may pose a security risk.
    runScripts: true,
    // This function will be called for each crawled URL.
    // Here we extract the window object from the options and use it to extract data from the page.
    requestHandler: async ({ window }) => {
        const { document } = window;
        // The `document` object is analogous to the `window.document` object you know from your favourite web browsers.
        // Thanks to this, you can use the regular browser-side APIs here.
        document.querySelectorAll('button')[12].click(); // 1
        document.querySelectorAll('button')[15].click(); // +
        document.querySelectorAll('button')[12].click(); // 1
        document.querySelectorAll('button')[18].click(); // =

        const result = document.querySelectorAll('.component-display')[0].childNodes[0] as Element;
        // The result is passed to the console. Unlike with Playwright or Puppeteer crawlers, 
        // this console call goes to the Node.js console, not the browser console. All the code here runs right in Node.js!
        log.info(result.innerHTML); // 2
    },
});

// Run the crawler and wait for it to finish.
await crawler.run([
    'https://ahfarmer.github.io/calculator/',
]);

log.debug('Crawler finished.');