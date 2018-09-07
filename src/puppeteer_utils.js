import fs from 'fs';
import vm from 'vm';
import Promise from 'bluebird';
import _ from 'underscore';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { checkParamPrototypeOrThrow } from 'apify-shared/utilities';
import { RequestQueue, RequestQueueLocal } from './request_queue';
import Request from './request';

const jqueryPath = require.resolve('jquery');
const underscorePath = require.resolve('underscore');
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
 * @memberof utils.puppeteer
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

    // TODO: For better performance we could use minimized version of the script
    return injectFile(page, jqueryPath);
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

    // TODO: For better performance we could use minimized version of the script
    return injectFile(page, underscorePath);
};

/**
 * DEPRECATED!
 * TODO: Remove after v1.0.0 gets released.
 * @ignore
 */
const enqueueRequestsFromClickableElements = async (page, selector, purls, requestQueue, requestOpts = {}) => {
    log.warning('Function enqueueRequestsFromClickableElements is deprecated!!! Use `enqueueLinks` instead!');

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
 * Finds HTML elements matching a CSS selector, clicks the elements and if a redirect is triggered and destination URL matches
 * one of the provided pseudo-URLs, then the function enqueues that URL to a given request queue.
 * To create a Request object function uses `requestTemplate` from a matching Pseudo-URL.
 *
 * *WARNING*: This is work in progress. Currently the function doesn't click elements and only takes their `href` attribute and so
 *            is working only for link (`a`) elements and not for buttons or javascript links.
 *
 * @param {Page} page Puppeteer [Page](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page) object.
 * @param {String} selector CSS selector matching elements to be clicked.
 * @param {Array} pseudoUrls An array of `Apify.PseudoUrl` objects matching URL to be enqueued.
 * @param {RequestQueue} requestQueue `Apify.RequestQueue` object where URLs will be enqueued.
 * @return {Promise} Promise resolves to array of RequestOperationInfo objects.
 * @memberof utils.puppeteer
 */
const enqueueLinks = async (page, selector, purls, requestQueue) => {
    checkParamOrThrow(page, 'page', 'Object');
    checkParamOrThrow(selector, 'selector', 'String');
    checkParamOrThrow(purls, 'purls', 'Array');
    checkParamPrototypeOrThrow(requestQueue, 'requestQueue', [RequestQueue, RequestQueueLocal], 'Apify.RequestQueue');

    /* istanbul ignore next */
    const getHrefs = linkEls => linkEls.map(link => link.href).filter(href => !!href);
    const urls = await page.$$eval(selector, getHrefs);
    const requests = [];

    urls.forEach((url) => {
        purls
            .filter(purl => purl.matches(url))
            .forEach(purl => requests.push(purl.createRequest(url)));
    });

    return Promise.mapSeries(requests, request => requestQueue.addRequest(request));
};

/**
 * Forces the browser tab to block loading certain page resources,
 * using the `Page.setRequestInterception(value)` method.
 * This is useful to speed up crawling of websites.
 *
 * The resource types to block can be controlled using the `resourceTypes` parameter,
 * which indicates the types of resources as they are perceived by the rendering engine.
 * The following resource types are currently supported:
 * `document`, `stylesheet`, `image`, `media`, `font`, `script`, `texttrack`, `xhr`, `fetch`,
 * `eventsource`, `websocket`, `manifest`, `other`.
 * For more details, see Puppeteer's
 * <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#requestresourcetype">Request.resourceType() documentation</a>.
 *
 * By default, the function blocks these resource types: `stylesheet`, `font`, `image`, `media`.
 *
 * @param {Page} page Puppeteer's `Page` object
 * @param {Array<String>} resourceTypes Array of resource types to block.
 * @return {Promise<void>}
 */
const blockResources = async (page, resourceTypes = ['stylesheet', 'font', 'image', 'media']) => {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        const type = request.resourceType();
        if (resourceTypes.includes(type)) request.abort();
        else request.continue();
    });
};

/**
 * Compiles a Puppeteer script into an async function that may be executed at any time
 * by providing it with the following object:
 * ```
 * {
 *    page: Puppeteer.Page,
 *    request: Apify.Request,
 * }
 * ```
 * The function is compiled by using the scriptString parameter as the function's body,
 * so any limitations to function bodies apply. Return value of the function is the return
 * value of the function body = scriptString parameter.
 *
 * As a security measure, no globals such as 'process' or 'require' are accessible
 * from within the function body. Note that the function does not provide a safe
 * sandbox and even though globals are not easily accessible, malicious code may
 * still execute in the main process via prototype manipulation. Therefore you
 * should only use this function to execute sanitized or safe code.
 *
 * @param {String} scriptString
 * @return {Function} async ({ page, request }) => { scriptString }
 */
const compileScript = (scriptString) => {
    const funcString = `async ({ page, request }) => {${scriptString}}`;

    let func;
    try {
        func = vm.runInNewContext(funcString, Object.create(null)); // "Secure" the context by removing prototypes.
    } catch (err) {
        log.exception(err, 'Cannot compile script!');
        throw err;
    }

    if (!_.isFunction(func)) throw new Error('Compilation result is not a function!'); // This should not happen...

    return func;
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
 * await Apify.utils.puppeteer.injectJQuery(page);
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
    enqueueLinks,
    blockResources,
    compileScript,
};
