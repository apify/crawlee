"use strict";
/**
 * A namespace that contains various utilities for
 * [Puppeteer](https://github.com/puppeteer/puppeteer) - the headless Chrome Node API.
 *
 * **Example usage:**
 *
 * ```javascript
 * import { launchPuppeteer, utils } from 'crawlee';
 *
 * // Open https://www.example.com in Puppeteer
 * const browser = await launchPuppeteer();
 * const page = await browser.newPage();
 * await page.goto('https://www.example.com');
 *
 * // Inject jQuery into a page
 * await utils.puppeteer.injectJQuery(page);
 * ```
 * @module puppeteerUtils
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.puppeteerUtils = exports.removeInterceptRequestHandler = exports.addInterceptRequestHandler = exports.enqueueLinksByClickingElements = exports.registerUtilsToContext = exports.saveSnapshot = exports.infiniteScroll = exports.gotoExtended = exports.compileScript = exports.cacheResponses = exports.blockResources = exports.sendCDPCommand = exports.blockRequests = exports.parseWithCheerio = exports.injectJQuery = exports.injectFile = void 0;
const tslib_1 = require("tslib");
const promises_1 = require("fs/promises");
const ow_1 = tslib_1.__importDefault(require("ow"));
const vm_1 = tslib_1.__importDefault(require("vm"));
const datastructures_1 = require("@apify/datastructures");
const log_1 = tslib_1.__importDefault(require("@apify/log"));
const browser_1 = require("@crawlee/browser");
const cheerio = tslib_1.__importStar(require("cheerio"));
const click_elements_1 = require("../enqueue-links/click-elements");
Object.defineProperty(exports, "enqueueLinksByClickingElements", { enumerable: true, get: function () { return click_elements_1.enqueueLinksByClickingElements; } });
const puppeteer_request_interception_1 = require("./puppeteer_request_interception");
Object.defineProperty(exports, "addInterceptRequestHandler", { enumerable: true, get: function () { return puppeteer_request_interception_1.addInterceptRequestHandler; } });
Object.defineProperty(exports, "removeInterceptRequestHandler", { enumerable: true, get: function () { return puppeteer_request_interception_1.removeInterceptRequestHandler; } });
const jqueryPath = require.resolve('jquery');
const MAX_INJECT_FILE_CACHE_SIZE = 10;
const DEFAULT_BLOCK_REQUEST_URL_PATTERNS = ['.css', '.jpg', '.jpeg', '.png', '.svg', '.gif', '.woff', '.pdf', '.zip'];
const log = log_1.default.child({ prefix: 'Puppeteer Utils' });
/**
 * Cache contents of previously injected files to limit file system access.
 */
const injectedFilesCache = new datastructures_1.LruCache({ maxLength: MAX_INJECT_FILE_CACHE_SIZE });
/**
 * Injects a JavaScript file into a Puppeteer page.
 * Unlike Puppeteer's `addScriptTag` function, this function works on pages
 * with arbitrary Cross-Origin Resource Sharing (CORS) policies.
 *
 * File contents are cached for up to 10 files to limit file system access.
 *
 * @param page Puppeteer [`Page`](https://pptr.dev/api/puppeteer.page) object.
 * @param filePath File path
 * @param [options]
 */
async function injectFile(page, filePath, options = {}) {
    (0, ow_1.default)(page, ow_1.default.object.validate(browser_1.validators.browserPage));
    (0, ow_1.default)(filePath, ow_1.default.string);
    (0, ow_1.default)(options, ow_1.default.object.exactShape({
        surviveNavigations: ow_1.default.optional.boolean,
    }));
    let contents = injectedFilesCache.get(filePath);
    if (!contents) {
        contents = await (0, promises_1.readFile)(filePath, 'utf8');
        injectedFilesCache.add(filePath, contents);
    }
    const evalP = page.evaluate(contents);
    if (options.surviveNavigations) {
        page.on('framenavigated', () => page.evaluate(contents)
            .catch((error) => log.warning('An error occurred during the script injection!', { error })));
    }
    return evalP;
}
exports.injectFile = injectFile;
/**
 * Injects the [jQuery](https://jquery.com/) library into a Puppeteer page.
 * jQuery is often useful for various web scraping and crawling tasks.
 * For example, it can help extract text from HTML elements using CSS selectors.
 *
 * Beware that the injected jQuery object will be set to the `window.$` variable and thus it might cause conflicts with
 * other libraries included by the page that use the same variable name (e.g. another version of jQuery).
 * This can affect functionality of page's scripts.
 *
 * The injected jQuery will survive page navigations and reloads by default.
 *
 * **Example usage:**
 * ```javascript
 * await utils.puppeteer.injectJQuery(page);
 * const title = await page.evaluate(() => {
 *   return $('head title').text();
 * });
 * ```
 *
 * Note that `injectJQuery()` does not affect the Puppeteer's
 * [`page.$()`](https://pptr.dev/api/puppeteer.page._/)
 * function in any way.
 *
 * @param page Puppeteer [`Page`](https://pptr.dev/api/puppeteer.page) object.
 * @param [options.surviveNavigations] Opt-out option to disable the JQuery reinjection after navigation.
 */
function injectJQuery(page, options) {
    (0, ow_1.default)(page, ow_1.default.object.validate(browser_1.validators.browserPage));
    return injectFile(page, jqueryPath, { surviveNavigations: options?.surviveNavigations ?? true });
}
exports.injectJQuery = injectJQuery;
/**
 * Returns Cheerio handle for `page.content()`, allowing to work with the data same way as with {@apilink CheerioCrawler}.
 *
 * **Example usage:**
 * ```javascript
 * const $ = await utils.puppeteer.parseWithCheerio(page);
 * const title = $('title').text();
 * ```
 *
 * @param page Puppeteer [`Page`](https://pptr.dev/api/puppeteer.page) object.
 */
async function parseWithCheerio(page) {
    (0, ow_1.default)(page, ow_1.default.object.validate(browser_1.validators.browserPage));
    const pageContent = await page.content();
    return cheerio.load(pageContent);
}
exports.parseWithCheerio = parseWithCheerio;
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
 * import { launchPuppeteer, utils } from 'crawlee';
 *
 * const browser = await launchPuppeteer();
 * const page = await browser.newPage();
 *
 * // Block all requests to URLs that include `adsbygoogle.js` and also all defaults.
 * await utils.puppeteer.blockRequests(page, {
 *     extraUrlPatterns: ['adsbygoogle.js'],
 * });
 *
 * await page.goto('https://cnn.com');
 * ```
 *
 * @param page Puppeteer [`Page`](https://pptr.dev/api/puppeteer.page) object.
 * @param [options]
 */
async function blockRequests(page, options = {}) {
    (0, ow_1.default)(page, ow_1.default.object.validate(browser_1.validators.browserPage));
    (0, ow_1.default)(options, ow_1.default.object.exactShape({
        urlPatterns: ow_1.default.optional.array.ofType(ow_1.default.string),
        extraUrlPatterns: ow_1.default.optional.array.ofType(ow_1.default.string),
    }));
    const { urlPatterns = DEFAULT_BLOCK_REQUEST_URL_PATTERNS, extraUrlPatterns = [], } = options;
    const patternsToBlock = [...urlPatterns, ...extraUrlPatterns];
    // We use CDP commands instead of request interception as the latter disables caching, which is not ideal
    await sendCDPCommand(page, 'Network.setBlockedURLs', { urls: patternsToBlock });
}
exports.blockRequests = blockRequests;
/**
 * @internal
 */
async function sendCDPCommand(page, command, ...args) {
    // In puppeteer 16.x and 17.x, the `_client` method is completely omitted from the types. It's still there and works the same way, but it is hidden.
    // Puppeteer <= 17
    if (Reflect.has(page, '_client')) {
        const client = Reflect.get(page, '_client');
        if (typeof client === 'function') {
            return client.call(page).send(command, ...args);
        }
        return client.send(command, ...args);
    }
    const jsonPath = require.resolve('puppeteer/package.json');
    const parsed = JSON.parse(await (0, promises_1.readFile)(jsonPath, 'utf-8'));
    // eslint-disable-next-line max-len
    throw new Error(`Cannot detect CDP client for Puppeteer ${parsed.version}. You should report this to Crawlee, mentioning the puppeteer version you are using.`);
}
exports.sendCDPCommand = sendCDPCommand;
/**
 * `blockResources()` has a high impact on performance in recent versions of Puppeteer.
 * Until this resolves, please use `utils.puppeteer.blockRequests()`.
 * @deprecated
 */
const blockResources = async (page, resourceTypes = ['stylesheet', 'font', 'image', 'media']) => {
    log.deprecated('utils.puppeteer.blockResources() has a high impact on performance in recent versions of Puppeteer. '
        + 'Until this resolves, please use utils.puppeteer.blockRequests()');
    await (0, puppeteer_request_interception_1.addInterceptRequestHandler)(page, async (request) => {
        const type = request.resourceType();
        if (resourceTypes.includes(type))
            await request.abort();
        else
            await request.continue();
    });
};
exports.blockResources = blockResources;
/**
 * *NOTE:* In recent versions of Puppeteer using this function entirely disables browser cache which resolves in sub-optimal
 * performance. Until this resolves, we suggest just relying on the in-browser cache unless absolutely necessary.
 *
 * Enables caching of intercepted responses into a provided object. Automatically enables request interception in Puppeteer.
 * *IMPORTANT*: Caching responses stores them to memory, so too loose rules could cause memory leaks for longer running crawlers.
 *   This issue should be resolved or atleast mitigated in future iterations of this feature.
 * @param page
 *   Puppeteer [`Page`](https://pptr.dev/api/puppeteer.page) object.
 * @param cache
 *   Object in which responses are stored
 * @param responseUrlRules
 *   List of rules that are used to check if the response should be cached.
 *   String rules are compared as page.url().includes(rule) while RegExp rules are evaluated as rule.test(page.url()).
 * @deprecated
 */
async function cacheResponses(page, cache, responseUrlRules) {
    (0, ow_1.default)(page, ow_1.default.object.validate(browser_1.validators.browserPage));
    (0, ow_1.default)(cache, ow_1.default.object);
    (0, ow_1.default)(responseUrlRules, ow_1.default.array.ofType(ow_1.default.any(ow_1.default.string, ow_1.default.regExp)));
    log.deprecated('utils.puppeteer.cacheResponses() has a high impact on performance '
        + 'in recent versions of Puppeteer so it\'s use is discouraged until this issue resolves.');
    await (0, puppeteer_request_interception_1.addInterceptRequestHandler)(page, async (request) => {
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
        if (cache[url])
            return;
        const shouldCache = responseUrlRules.some((rule) => {
            if (typeof rule === 'string')
                return url.includes(rule);
            if (rule instanceof RegExp)
                return rule.test(url);
            return false;
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
        }
        catch (e) {
            // ignore errors, usualy means that buffer is empty or broken connection
        }
    });
}
exports.cacheResponses = cacheResponses;
/**
 * Compiles a Puppeteer script into an async function that may be executed at any time
 * by providing it with the following object:
 * ```
 * {
 *    page: Page,
 *    request: Request,
 * }
 * ```
 * Where `page` is a Puppeteer [`Page`](https://pptr.dev/api/puppeteer.page)
 * and `request` is a {@apilink Request}.
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
 */
function compileScript(scriptString, context = Object.create(null)) {
    const funcString = `async ({ page, request }) => {${scriptString}}`;
    let func;
    try {
        func = vm_1.default.runInNewContext(funcString, context); // "Secure" the context by removing prototypes, unless custom context is provided.
    }
    catch (err) {
        log.exception(err, 'Cannot compile script!');
        throw err;
    }
    if (typeof func !== 'function')
        throw new Error('Compilation result is not a function!'); // This should not happen...
    return func;
}
exports.compileScript = compileScript;
/**
 * Extended version of Puppeteer's `page.goto()` allowing to perform requests with HTTP method other than GET,
 * with custom headers and POST payload. URL, method, headers and payload are taken from
 * request parameter that must be an instance of Request class.
 *
 * *NOTE:* In recent versions of Puppeteer using requests other than GET, overriding headers and adding payloads disables
 * browser cache which degrades performance.
 *
 * @param page Puppeteer [`Page`](https://pptr.dev/api/puppeteer.page) object.
 * @param request
 * @param [gotoOptions] Custom options for `page.goto()`.
 */
async function gotoExtended(page, request, gotoOptions = {}) {
    (0, ow_1.default)(page, ow_1.default.object.validate(browser_1.validators.browserPage));
    (0, ow_1.default)(request, ow_1.default.object.partialShape({
        url: ow_1.default.string.url,
        method: ow_1.default.optional.string,
        headers: ow_1.default.optional.object,
        payload: ow_1.default.optional.any(ow_1.default.string, ow_1.default.buffer),
    }));
    (0, ow_1.default)(gotoOptions, ow_1.default.object);
    const { url, method, headers, payload } = request;
    const isEmpty = (o) => !o || Object.keys(o).length === 0;
    if (method !== 'GET' || payload || !isEmpty(headers)) {
        // This is not deprecated, we use it to log only once.
        log.deprecated('Using other request methods than GET, rewriting headers and adding payloads has a high impact on performance '
            + 'in recent versions of Puppeteer. Use only when necessary.');
        let wasCalled = false;
        const interceptRequestHandler = async (interceptedRequest) => {
            // We want to ensure that this won't get executed again in a case that there is a subsequent request
            // for example for some asset file link from main HTML.
            if (wasCalled) {
                return interceptedRequest.continue();
            }
            wasCalled = true;
            const overrides = {};
            if (method !== 'GET')
                overrides.method = method;
            if (payload)
                overrides.postData = payload;
            if (!isEmpty(headers))
                overrides.headers = headers;
            await (0, puppeteer_request_interception_1.removeInterceptRequestHandler)(page, interceptRequestHandler);
            await interceptedRequest.continue(overrides);
        };
        await (0, puppeteer_request_interception_1.addInterceptRequestHandler)(page, interceptRequestHandler);
    }
    return page.goto(url, gotoOptions);
}
exports.gotoExtended = gotoExtended;
/**
 * Scrolls to the bottom of a page, or until it times out.
 * Loads dynamic content when it hits the bottom of a page, and then continues scrolling.
 * @param page Puppeteer [`Page`](https://pptr.dev/api/puppeteer.page) object.
 * @param [options]
 */
async function infiniteScroll(page, options = {}) {
    (0, ow_1.default)(page, ow_1.default.object.validate(browser_1.validators.browserPage));
    (0, ow_1.default)(options, ow_1.default.object.exactShape({
        timeoutSecs: ow_1.default.optional.number,
        waitForSecs: ow_1.default.optional.number,
        scrollDownAndUp: ow_1.default.optional.boolean,
        buttonSelector: ow_1.default.optional.string,
        stopScrollCallback: ow_1.default.optional.function,
    }));
    const { timeoutSecs = 0, waitForSecs = 4, scrollDownAndUp = false, buttonSelector, stopScrollCallback } = options;
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
    // Move mouse to the center of the page, so we can scroll up-down
    let body = await page.$('body');
    let retry = 0;
    while (!body && retry < 10) {
        await page.waitForTimeout(100);
        body = await page.$('body');
        retry++;
    }
    if (!body) {
        return;
    }
    const boundingBox = await body.boundingBox();
    await page.mouse.move(boundingBox.x + boundingBox.width / 2, // x
    boundingBox.y + boundingBox.height / 2);
    const checkFinished = setInterval(() => {
        if (resourcesStats.oldRequested === resourcesStats.newRequested) {
            resourcesStats.matchNumber++;
            if (resourcesStats.matchNumber >= waitForSecs) {
                clearInterval(checkFinished);
                finished = true;
                return;
            }
        }
        else {
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
        const bodyScrollHeight = await page.evaluate(() => document.body.scrollHeight);
        const delta = bodyScrollHeight === 0 ? SCROLL_HEIGHT_IF_ZERO : bodyScrollHeight;
        await page.mouse.wheel({ deltaY: delta });
    };
    const maybeClickButton = async () => {
        const button = await page.$(buttonSelector);
        // Box model returns null if the button is not visible
        if (button && await button.boxModel()) {
            await button.click({ delay: 10 });
        }
    };
    while (!finished) {
        await doScroll();
        await page.waitForTimeout(250);
        if (scrollDownAndUp) {
            await page.mouse.wheel({ deltaY: -1000 });
        }
        if (buttonSelector) {
            await maybeClickButton();
        }
        if (stopScrollCallback) {
            if (await stopScrollCallback()) {
                clearInterval(checkFinished);
                break;
            }
        }
    }
}
exports.infiniteScroll = infiniteScroll;
/**
 * Saves a full screenshot and HTML of the current page into a Key-Value store.
 * @param page Puppeteer [`Page`](https://pptr.dev/api/puppeteer.page) object.
 * @param [options]
 */
async function saveSnapshot(page, options = {}) {
    (0, ow_1.default)(page, ow_1.default.object.validate(browser_1.validators.browserPage));
    (0, ow_1.default)(options, ow_1.default.object.exactShape({
        key: ow_1.default.optional.string.nonEmpty,
        screenshotQuality: ow_1.default.optional.number,
        saveScreenshot: ow_1.default.optional.boolean,
        saveHtml: ow_1.default.optional.boolean,
        keyValueStoreName: ow_1.default.optional.string,
    }));
    const { key = 'SNAPSHOT', screenshotQuality = 50, saveScreenshot = true, saveHtml = true, keyValueStoreName, } = options;
    try {
        const store = await browser_1.KeyValueStore.open(keyValueStoreName);
        if (saveScreenshot) {
            const screenshotName = `${key}.jpg`;
            const screenshotBuffer = await page.screenshot({ fullPage: true, quality: screenshotQuality, type: 'jpeg' });
            await store.setValue(screenshotName, screenshotBuffer, { contentType: 'image/jpeg' });
        }
        if (saveHtml) {
            const htmlName = `${key}.html`;
            const html = await page.content();
            await store.setValue(htmlName, html, { contentType: 'text/html' });
        }
    }
    catch (err) {
        throw new Error(`saveSnapshot with key ${key} failed.\nCause:${err.message}`);
    }
}
exports.saveSnapshot = saveSnapshot;
/** @internal */
function registerUtilsToContext(context) {
    context.injectFile = (filePath, options) => injectFile(context.page, filePath, options);
    context.injectJQuery = (async () => {
        if (context.request.state === browser_1.RequestState.BEFORE_NAV) {
            log.warning('Using injectJQuery() in preNavigationHooks leads to unstable results. Use it in a postNavigationHook or a requestHandler instead.');
            await injectJQuery(context.page);
            return;
        }
        await injectJQuery(context.page, { surviveNavigations: false });
    });
    context.parseWithCheerio = () => parseWithCheerio(context.page);
    context.enqueueLinksByClickingElements = (options) => (0, click_elements_1.enqueueLinksByClickingElements)({
        page: context.page,
        requestQueue: context.crawler.requestQueue,
        ...options,
    });
    context.blockRequests = (options) => blockRequests(context.page, options);
    context.blockResources = (resourceTypes) => (0, exports.blockResources)(context.page, resourceTypes);
    context.cacheResponses = (cache, responseUrlRules) => {
        return cacheResponses(context.page, cache, responseUrlRules);
    };
    context.compileScript = (scriptString, ctx) => compileScript(scriptString, ctx);
    context.addInterceptRequestHandler = (handler) => (0, puppeteer_request_interception_1.addInterceptRequestHandler)(context.page, handler);
    context.removeInterceptRequestHandler = (handler) => (0, puppeteer_request_interception_1.removeInterceptRequestHandler)(context.page, handler);
    context.infiniteScroll = (options) => infiniteScroll(context.page, options);
    context.saveSnapshot = (options) => saveSnapshot(context.page, options);
}
exports.registerUtilsToContext = registerUtilsToContext;
/** @internal */
exports.puppeteerUtils = {
    injectFile,
    injectJQuery,
    enqueueLinksByClickingElements: click_elements_1.enqueueLinksByClickingElements,
    blockRequests,
    blockResources: exports.blockResources,
    cacheResponses,
    compileScript,
    gotoExtended,
    addInterceptRequestHandler: puppeteer_request_interception_1.addInterceptRequestHandler,
    removeInterceptRequestHandler: puppeteer_request_interception_1.removeInterceptRequestHandler,
    infiniteScroll,
    saveSnapshot,
    parseWithCheerio,
};
//# sourceMappingURL=puppeteer_utils.js.map