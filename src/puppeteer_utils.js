import fs from 'fs';
import path from 'path';
import Promise from 'bluebird';
import _ from 'underscore';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { checkParamPrototypeOrThrow } from 'apify-shared/utilities';
import { RequestQueue, RequestQueueLocal } from './request_queue';
import Request from './request';

const readFilePromised = Promise.promisify(fs.readFile);

/**
 * Hides certain Puppeteer fingerprints from the page, in order to help avoid detection of the crawler.
 * The function should be called on a newly-created page object before navigating to the target crawled page.
 *
 * @param {Page} page Puppeteer [Page](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page) object.
 * @return {Promise}
 * @memberof utils.puppeteer
 */
const hideWebDriver = async (page) => {
    checkParamOrThrow(page, 'page', 'Object');

    await page.evaluateOnNewDocument(() => {
        var modifiedNavigator; // eslint-disable-line no-var
        try {
            if (Navigator.prototype.hasOwnProperty('webdriver')) { // eslint-disable-line no-prototype-builtins
                modifiedNavigator = Navigator.prototype;
            } else {
                modifiedNavigator = Object.create(window.navigator);
                Object.defineProperty(window, 'navigator', {
                    value: modifiedNavigator,
                    configurable: false,
                    enumerable: true,
                    writable: false,
                });
            }
            Object.defineProperties(modifiedNavigator, {
                webdriver: {
                    configurable: true,
                    get: function () { // eslint-disable-line object-shorthand
                        return false;
                    },
                },
            });
            // Date.prototype.getTimezoneOffset = function () { return -4 * 60; };
        } catch (e) {
            console.error(e);
        }
    });
};

/**
 * Injects a JavaScript file into a Puppeteer page.
 * Unlike Puppeteer's `addScriptTag` function, this function works on pages
 * with arbitrary Cross-Origin Resource Sharing (CORS) policies.
 *
 * @param {Page} page Puppeteer [Page](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page) object.
 * @param {String} filePath File path
 * @return {Promise}
 */
const injectFile = async (page, filePath) => {
    checkParamOrThrow(page, 'page', 'Object');
    checkParamOrThrow(filePath, 'filePath', 'String');

    const contents = await readFilePromised(filePath, 'utf8');

    return page.evaluate(contents);
};

/**
 * Injects [jQuery](https://jquery.com/) library into a Puppeteer page.
 * jQuery is often useful for various web scraping and crawling tasks,
 * e.g. to extract data from HTML elements using CSS selectors.
 *
 * Beware that the injected jQuery object will be set to the `window.$` variable and thus it might cause conflicts with
 * libraries included by the page that use the same variable (e.g. another version of jQuery).
 *
 * @param {Page} page Puppeteer [Page](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page) object.
 * @return {Promise}
 * @memberof utils.puppeteer
 */
const injectJQuery = (page) => {
    checkParamOrThrow(page, 'page', 'Object');

    const scriptPath = path.resolve(path.join(__dirname, '../node_modules/jquery/dist/jquery.min.js'));

    return injectFile(page, scriptPath);
};

/**
 * Injects [Underscore.js](https://underscorejs.org/) library into a Puppeteer page.
 * Beware that the injected Underscore object will be set to the `window._` variable and thus it might cause conflicts with
 * libraries included by the page that use the same variable.
 *
 * @param {Page} page Puppeteer [Page](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page) object.
 * @return {Promise}
 * @memberof utils.puppeteer
 */
const injectUnderscore = (page) => {
    checkParamOrThrow(page, 'page', 'Object');

    const scriptPath = path.resolve(path.join(__dirname, '../node_modules/underscore/underscore-min.js'));

    return injectFile(page, scriptPath);
};

/**
 * Finds HTML elements matching a CSS selector, clicks the elements and if a redirect is triggered
 * and destination URL matches one of the provided pseudo-URLs, then the function enqueues that URL to a given request queue.
 *
 * *WARNING*: This is work in progress. Currently the function doesn't click elements and only takes their `href` attribute and so
 *            is working only for link (`a`) elements and not for buttons or javascript links.
 *
 * @param {Page} page Puppeteer [Page](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page) object.
 * @param {String} selector CSS selector matching elements to be clicked.
 * @param {Array} pseudoUrls An array of `Apify.PseudoUrl` objects matching URL to be enqueued.
 * @param {RequestQueue} requestQueue `Apify.RequestQueue` object where URLs will be enqueued.
 * @param {Object} requestOpts Optional `Apify.Request` options such as `userData` or `method` for the enqueued `Request` objects.
 * @return {Promise}
 * @memberof utils.puppeteer
 */
const enqueueRequestsFromClickableElements = async (page, selector, purls, requestQueue, requestOpts = {}) => {
    checkParamOrThrow(page, 'page', 'Object');
    checkParamOrThrow(purls, 'purls', 'Array');
    checkParamPrototypeOrThrow(requestQueue, 'requestQueue', [RequestQueue, RequestQueueLocal], 'Apify.RequestQueue');
    checkParamOrThrow(requestOpts, 'requestOpts', 'Object');

    /* istanbul ignore next */
    const getHrefs = linkEls => linkEls.map(link => link.href).filter(href => !!href);
    const matchesPseudoUrl = url => _.some(purls, purl => purl.matches(url));
    const urls = await page.$$eval(selector, getHrefs);
    const requests = urls.filter(matchesPseudoUrl).map(url => new Request(Object.assign({ url }, requestOpts)));

    return Promise.mapSeries(requests, request => requestQueue.addRequest(request));
};

/**
 * A namespace that contains various Puppeteer utilities.
 *
 * Example usage:
 * ```javascript
 * const Apify = require('apify');
 *
 * // Open https://www.example.com in Puppeteer
 * const browser = await Apify.launchPuppeteer();
 * const page = await browser.newPage();
 * await page.goto('https://www.example.com');
 *
 * // Inject jQuery into a page
 * await Apify.utils.puppeteer.injectJQueryScript(page);
 * ```
 * @namespace utils.puppeteer
 * @name utils.puppeteer
 */
export const puppeteerUtils = {
    hideWebDriver,
    injectFile,
    injectJQuery,
    injectUnderscore,
    enqueueRequestsFromClickableElements,
};
