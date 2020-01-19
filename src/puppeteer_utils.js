import fs from 'fs';
import vm from 'vm';
import util from 'util';
import _ from 'underscore';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { checkParamPrototypeOrThrow } from 'apify-shared/utilities';
import LruCache from 'apify-shared/lru_cache';
import { Page, Response } from 'puppeteer'; // eslint-disable-line no-unused-vars

import { RequestQueue, RequestQueueLocal } from './request_queue';
import Request from './request';
import { enqueueLinks } from './enqueue_links/enqueue_links';
import { enqueueLinksByClickingElements } from './enqueue_links/click_elements';
import { addInterceptRequestHandler, removeInterceptRequestHandler } from './puppeteer_request_interception';
import { openKeyValueStore } from './key_value_store';

const jqueryPath = require.resolve('jquery/dist/jquery.min');
const underscorePath = require.resolve('underscore/underscore-min');
const readFilePromised = util.promisify(fs.readFile);

const MAX_INJECT_FILE_CACHE_SIZE = 10;
const DEFAULT_BLOCK_REQUEST_URL_PATTERNS = ['.css', '.jpg', '.jpeg', '.png', '.svg', '.gif', '.woff', '.pdf', '.zip'];

/**
 * Hides certain Puppeteer fingerprints from the page, in order to help avoid detection of the crawler.
 * The function should be called on a newly-created page object before navigating to the target crawled page.
 *
 * @param {Page} page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 * @return {Promise}
 * @memberOf puppeteer
 * @ignore
 */
const hideWebDriver = async (page) => {
    log.deprecated('Apify.utils.puppeteer.hideWebDriver() is deprecated. Use launchPuppeteerOptions.stealth instead.');
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
 * Cache contents of previously injected files to limit file system access.
 */
const injectedFilesCache = new LruCache({ maxLength: MAX_INJECT_FILE_CACHE_SIZE });

/**
 * Injects a JavaScript file into a Puppeteer page.
 * Unlike Puppeteer's `addScriptTag` function, this function works on pages
 * with arbitrary Cross-Origin Resource Sharing (CORS) policies.
 *
 * File contents are cached for up to 10 files to limit file system access.
 *
 * @param {Page} page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 * @param {String} filePath File path
 * @param {Object} [options]
 * @param {boolean} [options.surviveNavigations]
 *   Enables the injected script to survive page navigations and reloads without need to be re-injected manually.
 *   This does not mean, however, that internal state will be preserved. Just that it will be automatically
 *   re-injected on each navigation before any other scripts get the chance to execute.
 * @return {Promise}
 * @memberOf puppeteer
 */
const injectFile = async (page, filePath, options = {}) => {
    checkParamOrThrow(page, 'page', 'Object');
    checkParamOrThrow(filePath, 'filePath', 'String');
    checkParamOrThrow(options, 'options', 'Object');

    let contents = injectedFilesCache.get(filePath);
    if (!contents) {
        contents = await readFilePromised(filePath, 'utf8');
        injectedFilesCache.add(filePath, contents);
    }
    const evalP = page.evaluate(contents);
    return options.surviveNavigations
        ? Promise.all([page.evaluateOnNewDocument(contents), evalP])
        : evalP;
};

/**
 * Injects the <a href="https://jquery.com/" target="_blank"><code>jQuery</code></a> library into a Puppeteer page.
 * jQuery is often useful for various web scraping and crawling tasks.
 * For example, it can help extract text from HTML elements using CSS selectors.
 *
 * Beware that the injected jQuery object will be set to the `window.$` variable and thus it might cause conflicts with
 * other libraries included by the page that use the same variable name (e.g. another version of jQuery).
 * This can affect functionality of page's scripts.
 *
 * The injected jQuery will survive page navigations and reloads.
 *
 * **Example usage:**
 * ```javascript
 * await Apify.utils.puppeteer.injectJQuery(page);
 * const title = await page.evaluate(() => {
 *   return $('head title').text();
 * });
 * ```
 *
 * Note that `injectJQuery()` does not affect the Puppeteer's
 * <a href="https://pptr.dev/#?product=Puppeteer&show=api-pageselector" target="_blank"><code>Page.$()</code></a>
 * function in any way.
 *
 * @param {Page} page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 * @return {Promise}
 * @memberOf puppeteer
 */
const injectJQuery = (page) => {
    checkParamOrThrow(page, 'page', 'Object');
    return injectFile(page, jqueryPath, { surviveNavigations: true });
};

/**
 * Injects the <a href="https://underscorejs.org/" target="_blank"><code>Underscore.js</code></a> library into a Puppeteer page.
 *
 * Beware that the injected Underscore object will be set to the `window._` variable and thus it might cause conflicts with
 * libraries included by the page that use the same variable name.
 * This can affect functionality of page's scripts.
 *
 * The injected Underscore will survive page navigations and reloads.
 *
 * **Example usage:**
 * ```javascript
 * await Apify.utils.puppeteer.injectUnderscore(page);
 * const escapedHtml = await page.evaluate(() => {
 *   return _.escape('<h1>Hello</h1>');
 * });
 * ```
 *
 * @param {Page} page Puppeteer [Page](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page) object.
 * @return {Promise}
 * @memberOf puppeteer
 */
const injectUnderscore = (page) => {
    checkParamOrThrow(page, 'page', 'Object');
    return injectFile(page, underscorePath, { surviveNavigations: true });
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

    const queueOperationInfos = [];
    for (const request of requests) {
        queueOperationInfos.push(await requestQueue.addRequest(request));
    }
    return queueOperationInfos;
};


/**
 * Forces the Puppeteer browser tab to block loading URLs that match a provided pattern.
 * This is useful to speed up crawling of websites, since it reduces the amount
 * of data that needs to be downloaded from the web, but it may break some websites
 * or unexpectedly prevent loading of resources.
 *
 * By default, the function will block all URLs including the following patterns:
 *
 * ```json
 * [".css", ".jpg", ".jpeg", ".png", ".svg", ".gif", ".woff", ".pdf", ".zip"]
 * ```
 *
 * If you want to extend this list further, use the `extraUrlPatterns` option,
 * which will keep blocking the default patterns, as well as add your custom ones.
 * If you would like to block only specific patterns, use the `urlPatterns` option,
 * which will override the defaults and block only URLs with your custom patterns.
 *
 * This function does not use Puppeteer's request interception and therefore does not interfere
 * with browser cache. It's also faster than blocking requests using interception,
 * because the blocking happens directly in the browser without the round-trip to Node.js,
 * but it does not provide the extra benefits of request interception.
 *
 * The function will never block main document loads and their respective redirects.
 *
 * **Example usage**
 * ```javascript
 * const Apify = require('apify');
 *
 * const browser = await Apify.launchPuppeteer();
 * const page = await browser.newPage();
 *
 * // Block all requests to URLs that include `adsbygoogle.js` and also all defaults.
 * await Apify.utils.puppeteer.blockRequests(page, {
 *     extraUrlPatterns: ['adsbygoogle.js'],
 * });
 *
 * await page.goto('https://cnn.com');
 * ```
 *
 * @param {Page} page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 * @param {Object} [options]
 * @param {string[]} [options.urlPatterns]
 *   The patterns of URLs to block from being loaded by the browser.
 *   Only `*` can be used as a wildcard. It is also automatically added to the beginning
 *   and end of the pattern. This limitation is enforced by the DevTools protocol.
 *   `.png` is the same as `*.png*`.
 * @param {string[]} [options.extraUrlPatterns]
 *   If you just want to append to the default blocked patterns, use this property.
 * @return {Promise}
 * @memberOf puppeteer
 */
const blockRequests = async (page, options = {}) => {
    checkParamOrThrow(page, 'page', 'Object');
    checkParamOrThrow(options, 'options', 'Object');

    const {
        urlPatterns = DEFAULT_BLOCK_REQUEST_URL_PATTERNS,
        extraUrlPatterns = [],
    } = options;

    checkParamOrThrow(urlPatterns, 'options.urlPatterns', '[String]');
    checkParamOrThrow(extraUrlPatterns, 'options.extraUrlPatterns', '[String]');

    const patternsToBlock = [...urlPatterns, ...extraUrlPatterns];

    await page._client.send('Network.setBlockedURLs', { urls: patternsToBlock }); // eslint-disable-line no-underscore-dangle
};

/**
 * `blockResources()` has a high impact on performance in recent versions of Puppeteer.
 * 'Until this resolves, please use `Apify.utils.puppeteer.blockRequests()`.
 * @deprecated
 */
const blockResources = async (page, resourceTypes = ['stylesheet', 'font', 'image', 'media']) => {
    log.deprecated('Apify.utils.puppeteer.blockResources() has a high impact on performance in recent versions of Puppeteer. '
        + 'Until this resolves, please use Apify.utils.puppeteer.blockRequests()');
    await addInterceptRequestHandler(page, async (request) => {
        const type = request.resourceType();
        if (resourceTypes.includes(type)) await request.abort();
        else await request.continue();
    });
};

/**
 * *NOTE:* In recent versions of Puppeteer using this function entirely disables browser cache which resolves in sub-optimal
 * performance. Until this resolves, we suggest just relying on the in-browser cache unless absolutely necessary.
 *
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
 * @deprecated
 */
const cacheResponses = async (page, cache, responseUrlRules) => {
    checkParamOrThrow(page, 'page', 'Object');
    checkParamOrThrow(cache, 'cache', 'Object');
    checkParamOrThrow(responseUrlRules, 'responseUrlRules', 'Array');

    log.deprecated('Apify.utils.puppeteer.cacheResponses() has a high impact on performance '
        + 'in recent versions of Puppeteer so it\'s use is discouraged until this issue resolves.');

    // Check that rules are either String or RegExp
    responseUrlRules.forEach((rule, index) => checkParamOrThrow(rule, `responseUrlRules[${index}]`, 'String | RegExp'));

    await addInterceptRequestHandler(page, async (request) => {
        const url = request.url();

        if (cache[url]) {
            await request.respond(cache[url]);
            return;
        }

        await request.continue();
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
 * Extended version of Puppeteer's `page.goto()` allowing to perform requests with HTTP method other than GET,
 * with custom headers and POST payload. URL, method, headers and payload are taken from
 * request parameter that must be an instance of Apify.Request class.
 *
 * *NOTE:* In recent versions of Puppeteer using requests other than GET, overriding headers and adding payloads disables
 * browser cache which degrades performance.
 *
 * @param {Page} page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 * @param {Request} request
 * @param {Object} gotoOptions Custom options for `page.goto()`.
 * @return {Promise<Response>}
 *
 * @memberOf puppeteer
 * @name gotoExtended
 */
export const gotoExtended = async (page, request, gotoOptions = {}) => {
    checkParamOrThrow(page, 'page', 'Object');
    checkParamPrototypeOrThrow(request, 'request', Request, 'Apify.Request');
    checkParamOrThrow(gotoOptions, 'gotoOptions', 'Object');

    const { method, headers, payload } = request;

    if (method !== 'GET' || payload || !_.isEmpty(headers)) {
        log.deprecated('Using other request methods than GET, rewriting headers and adding payloads has a high impact on performance '
            + 'in recent versions of Puppeteer. Use only when necessary.');
        let wasCalled = false;
        const interceptRequestHandler = async (interceptedRequest) => {
            // We want to ensure that this won't get executed again in a case that there is a subsequent request
            // for example for some asset file link from main HTML.
            if (wasCalled) return interceptedRequest.continue();

            wasCalled = true;
            const overrides = {};

            if (method !== 'GET') overrides.method = method;
            if (payload) overrides.postData = payload;
            if (!_.isEmpty(headers)) overrides.headers = headers;

            await interceptedRequest.continue(overrides);
            await removeInterceptRequestHandler(page, interceptRequestHandler); // We wan't this to be called only for the initial request.
        };

        await addInterceptRequestHandler(page, interceptRequestHandler);
    }

    return page.goto(request.url, gotoOptions);
};

/**
 * Scrolls to the bottom of a page, or until it times out.
 * Loads dynamic content when it hits the bottom of a page, and then continues scrolling.
 * @param {Object} page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 * @param {Object} [options]
 * @param {Number} [options.timeoutSecs=0]
 *   How many seconds to scroll for. If 0, will scroll until bottom of page.
 * @param {Number} [options.waitForSecs=4]
 *   How many seconds to wait for no new content to load before exit.
 * @returns {Promise}
 * @memberOf puppeteer
 * @name infiniteScroll
 */
export const infiniteScroll = async (page, options = {}) => {
    const { timeoutSecs = 0, waitForSecs = 4 } = options;

    checkParamOrThrow(page, 'page', 'Object');
    checkParamOrThrow(timeoutSecs, 'timeoutSecs', 'Number');
    checkParamOrThrow(waitForSecs, 'waitForSecs', 'Number');

    let finished;
    const startTime = Date.now();
    const CHECK_INTERVAL_MILLIS = 1000;
    const SCROLL_HEIGHT_IF_ZERO = 10000;
    const maybeResourceTypesInfiniteScroll = ['xhr', 'fetch', 'websocket', 'other'];
    const resourcesStats = {
        newRequested: 0,
        oldRequested: 0,
        matchNumber: 0,
    };

    page.on('request', (msg) => {
        if (maybeResourceTypesInfiniteScroll.includes(msg.resourceType())) {
            resourcesStats.newRequested++;
        }
    });

    const checkFinished = setInterval(() => {
        if (resourcesStats.oldRequested === resourcesStats.newRequested) {
            resourcesStats.matchNumber++;
            if (resourcesStats.matchNumber >= waitForSecs) {
                clearInterval(checkFinished);
                finished = true;
                return;
            }
        } else {
            resourcesStats.matchNumber = 0;
            resourcesStats.oldRequested = resourcesStats.newRequested;
        }
        // check if timeout has been reached
        if (timeoutSecs !== 0 && (Date.now() - startTime) / 1000 > timeoutSecs) {
            clearInterval(checkFinished);
            finished = true;
        }
    }, CHECK_INTERVAL_MILLIS);

    const doScroll = async () => {
        /* istanbul ignore next */
        await page.evaluate(async (scrollHeightIfZero) => {
            const delta = document.body.scrollHeight === 0 ? scrollHeightIfZero : document.body.scrollHeight;
            window.scrollBy(0, delta);
        }, SCROLL_HEIGHT_IF_ZERO);
    };

    while (!finished) {
        await doScroll();
    }
};

/**
 * Saves a full screenshot and HTML of the current page into a Key-Value store.
 * @param {Object} page
 *   Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
 * @param {Object} [options]
 * @param {String} [options.key=SNAPSHOT]
 *   Key under which the screenshot and HTML will be saved. `.jpg` will be appended for screenshot and `.html` for HTML.
 * @param {Number} [options.screenshotQuality=50]
 *   The quality of the image, between 0-100. Higher quality images have bigger size and require more storage.
 * @param {Boolean} [options.saveScreenshot=true]
 *   If true, it will save a full screenshot of the current page as a record with `key` appended by `.jpg`.
 * @param {Boolean} [options.saveHtml=true]
 *   If true, it will save a full HTML of the current page as a record with `key` appended by `.html`.
 * @param {String} [options.keyValueStoreName=null]
 *   Name or id of the Key-Value store where snapshot is saved. By default it is saved to default Key-Value store.
 * @returns {Promise}
 * @memberOf puppeteer
 * @name saveSnapshot
 */
const saveSnapshot = async (page, options = {}) => {
    const DEFAULT_KEY = 'SNAPSHOT';
    let key;
    try {
        checkParamOrThrow(page, 'page', 'Object');
        checkParamOrThrow(options, 'options', 'Object');

        const { saveScreenshot = true, saveHtml = true, keyValueStoreName = null, screenshotQuality = 50 } = options;
        key = options.key || DEFAULT_KEY;

        checkParamOrThrow(saveScreenshot, 'saveScreenshot', 'Boolean');
        checkParamOrThrow(saveHtml, 'saveHtml', 'Boolean');
        checkParamOrThrow(key, 'key', 'String');
        checkParamOrThrow(keyValueStoreName, 'keyValueStoreName', 'Maybe String');
        checkParamOrThrow(screenshotQuality, 'screenshotQuality', 'Number');

        const store = await openKeyValueStore(keyValueStoreName);

        if (saveScreenshot) {
            const screenshotBuffer = await page.screenshot({ fullPage: true, screenshotQuality, type: 'jpeg' });
            await store.setValue(`${key}.jpg`, screenshotBuffer, { contentType: 'image/jpeg' });
        }
        if (saveHtml) {
            const html = await page.content();
            await store.setValue(`${key}.html`, html, { contentType: 'text/html' });
        }
    } catch (e) {
        // I like this more than having to investigate stack trace
        log.error(`saveSnapshot with key ${key || ''} failed with error:`);
        throw e;
    }
};

let logEnqueueLinksDeprecationWarning = true;

/**
 * A namespace that contains various utilities for
 * [Puppeteer](https://github.com/GoogleChrome/puppeteer) - the headless Chrome Node API.
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
    enqueueLinks: async (...args) => {
        if (logEnqueueLinksDeprecationWarning) {
            log.warning('Using enqueueLinks() from the Apify.utils.puppeteer namespace is deprecated. '
                + 'Please use the Apify.utils.enqueueLinks().');
            logEnqueueLinksDeprecationWarning = false;
            return enqueueLinks(...args);
        }
    },
    enqueueLinksByClickingElements,
    blockRequests,
    blockResources,
    cacheResponses,
    compileScript,
    gotoExtended,
    addInterceptRequestHandler,
    removeInterceptRequestHandler,
    infiniteScroll,
    saveSnapshot,
};
