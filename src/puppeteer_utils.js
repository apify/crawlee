import fs from 'fs';
import vm from 'vm';
import util from 'util';
import _ from 'underscore';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { checkParamPrototypeOrThrow } from 'apify-shared/utilities';
import { RequestQueue, RequestQueueLocal } from './request_queue';
import Request from './request';
import PseudoUrl from './pseudo_url';

const jqueryPath = require.resolve('jquery');
const underscorePath = require.resolve('underscore');
const readFilePromised = util.promisify(fs.readFile);

/**
 * Hides certain Puppeteer fingerprints from the page, in order to help avoid detection of the crawler.
 * The function should be called on a newly-created page object before navigating to the target crawled page.
 *
 * @param {Page} page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 * @return {Promise}
 * @memberOf puppeteer
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
 * @param {Page} page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 * @param {String} filePath File path
 * @return {Promise}
 * @memberOf puppeteer
 */
const injectFile = async (page, filePath) => {
    checkParamOrThrow(page, 'page', 'Object');
    checkParamOrThrow(filePath, 'filePath', 'String');

    const contents = await readFilePromised(filePath, 'utf8');

    return page.evaluate(contents);
};

/**
 * Injects the <a href="https://jquery.com/" target="_blank"><code>jQuery</code></a> library into a Puppeteer page.
 * jQuery is often useful for various web scraping and crawling tasks,
 * e.g. to extract data from HTML elements using CSS selectors.
 *
 * Beware that the injected jQuery object will be set to the `window.$` variable and thus it might cause conflicts with
 * libraries included by the page that use the same variable (e.g. another version of jQuery).
 *
 * @param {Page} page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 * @return {Promise}
 * @memberOf puppeteer
 */
const injectJQuery = (page) => {
    checkParamOrThrow(page, 'page', 'Object');

    // TODO: For better performance we could use minimized version of the script
    return injectFile(page, jqueryPath);
};

/**
 * Injects the <a href="https://underscorejs.org/" target="_blank"><code>Underscore.js</code></a> library into a Puppeteer page.
 * Beware that the injected Underscore object will be set to the `window._` variable and thus it might cause conflicts with
 * libraries included by the page that use the same variable.
 *
 * @param {Page} page Puppeteer [Page](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page) object.
 * @return {Promise}
 * @memberOf puppeteer
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

    const requestOperationInfos = [];
    for (const request of requests) {
        requestOperationInfos.push(await requestQueue.addRequest(request));
    }
    return requestOperationInfos;
};

/**
 * To enable direct use of the Actor UI `pseudoUrls` output while keeping high performance,
 * all the pseudoUrls from the output are only constructed once and kept in a cache
 * by the `enqueueLinks()` function.
 * @ignore
 */
const enqueueLinksCache = new Map();
export const MAX_ENQUEUE_LINKS_CACHE_SIZE = 1000;

/**
 * Helper factory used in the `enqeueLinks()` function.
 * @param {Array} pseudoUrls
 * @returns {Array}
 * @ignore
 */
export const constructPseudoUrlInstances = (pseudoUrls) => {
    return pseudoUrls.map((item, idx) => {
        // Get pseudoUrl instance from cache.
        let pUrl = enqueueLinksCache.get(item);
        if (pUrl) return pUrl;
        // Nothing in cache, make a new instance.
        checkParamOrThrow(item, `pseudoUrls[${idx}]`, 'Object|String');
        if (item instanceof PseudoUrl) pUrl = item;
        else if (typeof item === 'string') pUrl = new PseudoUrl(item);
        else pUrl = new PseudoUrl(item.purl, _.omit(item, 'purl'));
        // Manage cache
        enqueueLinksCache.set(item, pUrl);
        if (enqueueLinksCache.size > MAX_ENQUEUE_LINKS_CACHE_SIZE) {
            const key = enqueueLinksCache.keys().next().value;
            enqueueLinksCache.delete(key);
        }
        return pUrl;
    });
};

/**
 * Remove with 1.0.0
 * @ignore
 * @todo
 */
let logDeprecationWarning = true;

/**
 * Finds HTML elements matching a CSS selector, clicks the elements and if a redirect is triggered and destination URL matches
 * one of the provided {@link PseudoUrl}s, then the function enqueues that URL to a given request queue.
 * To create a Request object function uses `requestTemplate` from a matching {@link PseudoUrl}.
 *
 * *WARNING*: This is work in progress. Currently the function doesn't click elements and only takes their `href` attribute and so
 *            is working only for link (`a`) elements, but not for buttons or JavaScript links.
 *
 * @param {Page} page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 * @param {String} selector
 *   CSS selector matching elements to be clicked.
 * @param {RequestQueue} requestQueue
 *   {@link RequestQueue} instance where URLs will be enqueued.
 * @param {PseudoUrl[]|Object[]|String[]} [pseudoUrls]
 *   An array of {@link PseudoUrl}s matching the URLs to be enqueued,
 *   or an array of Strings or Objects from which the {@link PseudoUrl}s should be constructed
 *   The Objects must include at least a `purl` property, which holds a pseudoUrl string.
 *   All remaining keys will be used as the `requestTemplate` argument of the {@link PseudoUrl} constructor.
 * @return {Promise<RequestOperationInfo[]>}
 *   Promise that resolves to an array of {@link RequestOperationInfo} objects.
 * @memberOf puppeteer
 */
const enqueueLinks = async (page, selector, requestQueue, pseudoUrls = []) => {
    // TODO: Remove after v1.0.0 gets released.
    // Check for pseudoUrls as a third parameter.
    if (Array.isArray(requestQueue)) {
        if (logDeprecationWarning) {
            log.warning('Argument "pseudoUrls" as the third parameter to enqueueLinks() is deprecated. '
                + 'Use enqueueLinks(page, selector, requestQueue, pseudoUrls) instead. "pseudoUrls" are now optional.');
            logDeprecationWarning = false;
        }
        const tmp = requestQueue;
        requestQueue = pseudoUrls;
        pseudoUrls = tmp;
    }

    checkParamOrThrow(page, 'page', 'Object');
    checkParamOrThrow(selector, 'selector', 'String');
    checkParamPrototypeOrThrow(requestQueue, 'requestQueue', [RequestQueue, RequestQueueLocal], 'Apify.RequestQueue');
    checkParamOrThrow(pseudoUrls, 'pseudoUrls', 'Array');

    // Construct pseudoUrls from input where necessary.
    const pseudoUrlInstances = constructPseudoUrlInstances(pseudoUrls);

    /* istanbul ignore next */
    const getHrefs = linkEls => linkEls.map(link => link.href).filter(href => !!href);
    const urls = await page.$$eval(selector, getHrefs);
    let requests = [];

    if (pseudoUrlInstances.length) {
        urls.forEach((url) => {
            pseudoUrlInstances
                .filter(purl => purl.matches(url))
                .forEach(purl => requests.push(purl.createRequest(url)));
        });
    } else {
        requests = urls.map(url => ({ url }));
    }

    const requestOperationInfos = [];
    for (const request of requests) {
        requestOperationInfos.push(await requestQueue.addRequest(request));
    }
    return requestOperationInfos;
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
 * <a href="https://pptr.dev/#?product=Puppeteer&show=api-requestresourcetype" target="_blank">Request.resourceType() documentation</a>.
 *
 * By default, the function blocks these resource types: `stylesheet`, `font`, `image`, `media`.
 *
 * @param {Page} page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 * @param {String[]} resourceTypes Array of resource types to block.
 * @return {Promise}
 * @memberOf puppeteer
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
 * Enables caching of intercepted responses into a provided object. Automatically enables request interception in Puppeteer.
 * *IMPORTANT*: Caching responses stores them to memory, so too loose rules could cause memory leaks for longer running crawlers.
 *   This issue should be resolved or atleast mitigated in future iterations of this feature.
 * @param {Page} page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 * @param {Object} cache
 *   Object in which responses are stored
 * @param {Array<String|RegExp>} responseUrlRules
 *   List of rules that are used to check if the response should be cached.
 *   String rules are compared as page.url().includes(rule) while RegExp rules are evaluated as rule.test(page.url()).
 * @return {Promise}
 * @memberOf puppeteer
 */
const cacheResponses = async (page, cache, responseUrlRules) => {
    checkParamOrThrow(page, 'page', 'Object');
    checkParamOrThrow(cache, 'cache', 'Object');
    checkParamOrThrow(responseUrlRules, 'responseUrlRules', 'Array');

    // Check that rules are either String or RegExp
    responseUrlRules.forEach((rule, index) => checkParamOrThrow(rule, `responseUrlRules[${index}]`, 'String | RegExp'));

    // Required to be able to intercept requests
    await page.setRequestInterception(true);

    page.on('request', async (request) => {
        const url = request.url();

        if (cache[url]) {
            await request.respond(cache[url]);
            return;
        }

        request.continue();
    });

    page.on('response', async (response) => {
        const url = response.url();

        // Response is already cached, do nothing
        if (cache[url]) return;

        const shouldCache = responseUrlRules.some((rule) => {
            if (typeof rule === 'string') return url.includes(rule);
            if (rule instanceof RegExp) return rule.test(url);
        });

        try {
            if (shouldCache) {
                const buffer = await response.buffer();
                cache[url] = {
                    status: response.status(),
                    headers: response.headers(),
                    body: buffer,
                };
            }
        } catch (e) {
            // ignore errors, usualy means that buffer is empty or broken connection
        }
    });
};

/**
 * Compiles a Puppeteer script into an async function that may be executed at any time
 * by providing it with the following object:
 * ```
 * {
 *    page: Page,
 *    request: Request,
 * }
 * ```
 * Where `page` is a Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a>
 * and `request` is a {@link Request}.
 *
 * The function is compiled by using the `scriptString` parameter as the function's body,
 * so any limitations to function bodies apply. Return value of the compiled function
 * is the return value of the function body = the `scriptString` parameter.
 *
 * As a security measure, no globals such as `process` or `require` are accessible
 * from within the function body. Note that the function does not provide a safe
 * sandbox and even though globals are not easily accessible, malicious code may
 * still execute in the main process via prototype manipulation. Therefore you
 * should only use this function to execute sanitized or safe code.
 *
 * Custom context may also be provided using the `context` parameter. To improve security,
 * make sure to only pass the really necessary objects to the context. Preferably making
 * secured copies beforehand.
 *
 * @param {String} scriptString
 * @param {Object} context
 * @return {Function} `async ({ page, request }) => { scriptString }`
 * @memberOf puppeteer
 */
const compileScript = (scriptString, context = Object.create(null)) => {
    const funcString = `async ({ page, request }) => {${scriptString}}`;

    let func;
    try {
        func = vm.runInNewContext(funcString, context); // "Secure" the context by removing prototypes, unless custom context is provided.
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
 * **Example usage:**
 *
 * ```javascript
 * const Apify = require('apify');
 * const { puppeteer } = Apify.utils;
 *
 * // Open https://www.example.com in Puppeteer
 * const browser = await Apify.launchPuppeteer();
 * const page = await browser.newPage();
 * await page.goto('https://www.example.com');
 *
 * // Inject jQuery into a page
 * await puppeteer.injectJQuery(page);
 * ```
 * @namespace puppeteer
 */
export const puppeteerUtils = {
    hideWebDriver,
    injectFile,
    injectJQuery,
    injectUnderscore,
    enqueueRequestsFromClickableElements,
    enqueueLinks,
    blockResources,
    cacheResponses,
    compileScript,
};
