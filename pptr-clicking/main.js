const Apify = require('apify');

/**
 * Clicks all elements of given page matching given selector.
 * Catches and intercepts all the initiated requests and opened pages.
 * Returns a list of all target URLs.
 *
 * @param {Page} page
 * @param {String} selector
 * @return {Promise<String>}
 */
const clickElements = async (page, selector) => {
    const urlSet = new Set();
    const browser = page.browser();

    const interceptionHandler = (req) => {
        if (req.isNavigationRequest() && req.frame() === page.mainFrame() && req.url() !== page.url()) {
            // TODO: We need to store also HTTP method, payload and headers here.
            urlSet.add(req.url());
            req.respond(req.redirectChain().length
                ? { body: '' } // Prevents 301/302 redirect
                : { status: 204 } // Prevents navigation by js
            )
        } else {
            req.continue();
        }
    };

    const targetCreatedHandler = async (target) => {
        if (target.type() === 'page') {
            // TODO: We need to store also HTTP method, payload and headers here.
            const page = await target.page();
            urlSet.add(page.url());
            page.close();
        }
    };

    // Add request interception handler and on new-target handler.
    await Apify.utils.puppeteer.addInterceptRequestHandler(page, interceptionHandler);
    browser.on('targetcreated', targetCreatedHandler);

    // Click all the elements.
    const elementHandles = await page.$$(selector);
    let remainingCount = elementHandles.length;
    let zIndex = 10000;
    for (let elementHandle of elementHandles) {
      console.log(`Remaining elements: ${remainingCount--}`);
      try {
          // Ensure that element is visible ...
          await page.evaluate((el, zIndex) => {
              el.style.visiblity = 'visible';
              el.style.display = 'block';
              el.style.position = 'absolute';
              el.style.zindex = zIndex;
          }, elementHandle, zIndex++);

          // ... and then click it.
          await elementHandle.click();
      } catch (err) {
          console.log(`Click failed: ${err.message}`);
      }
    }

    // Removes all listeners.
    browser.removeListener('targetcreated', targetCreatedHandler);
    await Apify.utils.puppeteer.removeInterceptRequestHandler(page, interceptionHandler);

    return urls;
};

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({
        // url: 'https://www.retailmenot.com/',
        url: 'https://www.imdb.com/',
    });

    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,
        handlePageTimeoutSecs: 300,
        launchPuppeteerOptions: {
            headless: true,
        },
        handlePageFunction: async ({ request, page }) => {
            const urls = await clickElements(page, '*');

            console.log(urls);
        },
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed too many times`);
        },
    });

    await crawler.run();
    console.log('Crawler finished.');
});
