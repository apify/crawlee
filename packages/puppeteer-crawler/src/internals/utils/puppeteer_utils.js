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
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { Configuration, KeyValueStore, serviceLocator, validators } from '@crawlee/browser';
import { expandShadowRoots, sleep } from '@crawlee/utils';
import { parseArgument, schemas } from '@crawlee/utils/internal';
import { z } from 'zod';
import { LruCache } from '@apify/datastructures';
import { enqueueLinksByClickingElements } from '../enqueue-links/click-elements.js';
import { addInterceptRequestHandler, removeInterceptRequestHandler } from './puppeteer_request_interception.js';
const require = createRequire(import.meta.url);
const jqueryPath = require.resolve('jquery');
const MAX_INJECT_FILE_CACHE_SIZE = 10;
const DEFAULT_BLOCK_REQUEST_URL_PATTERNS = ['.css', '.jpg', '.jpeg', '.png', '.svg', '.gif', '.woff', '.pdf', '.zip'];
const filePathSchema = z.string();
const injectFileOptionsSchema = z.strictObject({
    surviveNavigations: z.boolean().optional(),
});
const responseUrlRulesSchema = schemas.arrayOf(z.union([z.string(), z.instanceof(RegExp)]), 'strings or RegExps');
const gotoExtendedRequestSchema = z.looseObject({
    url: z.url(),
    method: z.string().optional(),
    headers: schemas.anyObject.optional(),
    payload: z.union([z.string(), z.instanceof(Uint8Array)]).optional(),
});
const blockRequestsOptionsSchema = z.strictObject({
    urlPatterns: schemas.arrayOf(z.string(), 'strings').default(DEFAULT_BLOCK_REQUEST_URL_PATTERNS),
    extraUrlPatterns: schemas.arrayOf(z.string(), 'strings').default(() => []),
});
const infiniteScrollOptionsSchema = z.strictObject({
    timeoutSecs: schemas.anyNumber.default(0),
    maxScrollHeight: schemas.anyNumber.default(0),
    waitForSecs: schemas.anyNumber.default(4),
    scrollDownAndUp: z.boolean().default(false),
    buttonSelector: z.string().optional(),
    stopScrollCallback: schemas.anyFunction.optional(),
});
const saveSnapshotOptionsSchema = z.strictObject({
    key: z.string().min(1).default('SNAPSHOT'),
    screenshotQuality: schemas.anyNumber.default(50),
    saveScreenshot: z.boolean().default(true),
    saveHtml: z.boolean().default(true),
    keyValueStoreName: z.string().optional(),
    configuration: schemas.anyObject.optional(),
});
const getLog = () => serviceLocator.getChildLog('Puppeteer Utils');
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
 * @param page Puppeteer [`Page`](https://pptr.dev/api/puppeteer.page) object.
 * @param filePath File path
 * @param [options]
 */
export async function injectFile(page, filePath, options = {}) {
    parseArgument(page, validators.browserPage);
    parseArgument(filePath, filePathSchema);
    const { surviveNavigations } = parseArgument(options, injectFileOptionsSchema);
    let contents = injectedFilesCache.get(filePath);
    if (!contents) {
        contents = await readFile(filePath, 'utf8');
        injectedFilesCache.add(filePath, contents);
    }
    const evalP = page.evaluate(contents);
    if (surviveNavigations) {
        page.on('framenavigated', async () => page
            .evaluate(contents)
            .catch((error) => getLog().warning('An error occurred during the script injection!', { error })));
    }
    return evalP;
}
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
export async function injectJQuery(page, options) {
    parseArgument(page, validators.browserPage);
    return injectFile(page, jqueryPath, { surviveNavigations: options?.surviveNavigations ?? true });
}
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
 * @param ignoreShadowRoots
 */
export async function parseWithCheerio(page, ignoreShadowRoots = false, ignoreIframes = false) {
    parseArgument(page, validators.browserPage);
    if (page.frames().length > 1 && !ignoreIframes) {
        const frames = await page.$$('iframe');
        await Promise.all(frames.map(async (frame) => {
            try {
                const iframe = await frame.contentFrame();
                if (iframe) {
                    const getIframeHTML = async () => {
                        try {
                            return iframe.$eval('body', (el) => el.innerHTML);
                        }
                        catch {
                            return iframe.content();
                        }
                    };
                    const contents = await getIframeHTML();
                    await frame.evaluate((f, c) => {
                        const replacementNode = document.createElement('div');
                        replacementNode.innerHTML = c;
                        replacementNode.className = 'crawlee-iframe-replacement';
                        f.replaceWith(replacementNode);
                    }, contents);
                }
            }
            catch (error) {
                getLog().warning(`Failed to extract iframe content: ${error}`);
            }
        }));
    }
    const html = ignoreShadowRoots
        ? null
        : (await page.evaluate(`(${expandShadowRoots.toString()})(document)`));
    const pageContent = html || (await page.content());
    const { load } = await import('cheerio');
    return load(pageContent);
}
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
export async function blockRequests(page, options = {}) {
    parseArgument(page, validators.browserPage);
    const { urlPatterns, extraUrlPatterns } = parseArgument(options, blockRequestsOptionsSchema);
    const patternsToBlock = [...urlPatterns, ...extraUrlPatterns];
    // We use CDP commands instead of request interception as the latter disables caching, which is not ideal
    await sendCDPCommand(page, 'Network.setBlockedURLs', { urls: patternsToBlock });
}
/**
 * @internal
 */
export async function sendCDPCommand(page, command, ...args) {
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
    const parsed = JSON.parse(await readFile(jsonPath, 'utf-8'));
    throw new Error(`Cannot detect CDP client for Puppeteer ${parsed.version}. You should report this to Crawlee, mentioning the puppeteer version you are using.`);
}
/**
 * `blockResources()` has a high impact on performance in recent versions of Puppeteer.
 * Until this resolves, please use `utils.puppeteer.blockRequests()`.
 * @deprecated
 */
export const blockResources = async (page, resourceTypes = ['stylesheet', 'font', 'image', 'media']) => {
    serviceLocator
        .getLogger()
        .deprecated('utils.puppeteer.blockResources() has a high impact on performance in recent versions of Puppeteer. ' +
        'Until this resolves, please use utils.puppeteer.blockRequests()');
    await addInterceptRequestHandler(page, async (request) => {
        const type = request.resourceType();
        if (resourceTypes.includes(type))
            await request.abort();
        else
            await request.continue();
    });
};
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
export async function cacheResponses(page, cache, responseUrlRules) {
    parseArgument(page, validators.browserPage);
    parseArgument(cache, schemas.anyObject);
    parseArgument(responseUrlRules, responseUrlRulesSchema);
    serviceLocator
        .getLogger()
        .deprecated('utils.puppeteer.cacheResponses() has a high impact on performance ' +
        "in recent versions of Puppeteer so it's use is discouraged until this issue resolves.");
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
        catch {
            // ignore errors, usually means that buffer is empty or broken connection
        }
    });
}
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
export function compileScript(scriptString, context = Object.create(null)) {
    const funcString = `async ({ page, request }) => {${scriptString}}`;
    let func;
    try {
        func = vm.runInNewContext(funcString, context); // "Secure" the context by removing prototypes, unless custom context is provided.
    }
    catch (err) {
        getLog().exception(err, 'Cannot compile script!');
        throw err;
    }
    if (typeof func !== 'function')
        throw new Error('Compilation result is not a function!'); // This should not happen...
    return func;
}
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
export async function gotoExtended(page, request, gotoOptions = {}) {
    parseArgument(page, validators.browserPage);
    parseArgument(request, gotoExtendedRequestSchema);
    parseArgument(gotoOptions, schemas.anyObject);
    gotoOptions = { ...gotoOptions };
    if (gotoOptions.waitUntil === 'networkidle') {
        gotoOptions.waitUntil = 'networkidle0';
    }
    const { url, method, headers, payload } = request;
    const isEmpty = (o) => !o || Object.keys(o).length === 0;
    if (method !== 'GET' || payload) {
        // This is not deprecated, we use it to log only once.
        serviceLocator
            .getLogger()
            .deprecated('Using other request methods than GET, rewriting headers and adding payloads has a high impact on performance ' +
            'in recent versions of Puppeteer. Use only when necessary.');
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
            await removeInterceptRequestHandler(page, interceptRequestHandler);
            await interceptedRequest.continue(overrides);
            return undefined;
        };
        await addInterceptRequestHandler(page, interceptRequestHandler);
    }
    else if (!isEmpty(headers)) {
        const extraHeaders = { ...headers };
        // Chrome bundled with Puppeteer 25+ ignores a `User-Agent` passed via `setExtraHTTPHeaders()`, it has to be set explicitly.
        for (const name of Object.keys(extraHeaders)) {
            if (name.toLowerCase() === 'user-agent') {
                await page.setUserAgent(extraHeaders[name]);
                delete extraHeaders[name];
            }
        }
        if (!isEmpty(extraHeaders)) {
            await page.setExtraHTTPHeaders(extraHeaders);
        }
    }
    return page.goto(url, gotoOptions);
}
/**
 * Scrolls to the bottom of a page, or until it times out.
 * Loads dynamic content when it hits the bottom of a page, and then continues scrolling.
 * @param page Puppeteer [`Page`](https://pptr.dev/api/puppeteer.page) object.
 * @param [options]
 */
export async function infiniteScroll(page, options = {}) {
    parseArgument(page, validators.browserPage);
    const { timeoutSecs, maxScrollHeight, waitForSecs, scrollDownAndUp, buttonSelector, stopScrollCallback } = parseArgument(options, infiniteScrollOptionsSchema);
    let finished;
    const startTime = Date.now();
    const CHECK_INTERVAL_MILLIS = 1000;
    const SCROLL_HEIGHT_IF_ZERO = 10000;
    let scrolledDistance = 0;
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
        await sleep(100);
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
        // check if max scroll height has been reached
        if (maxScrollHeight > 0 && scrolledDistance > maxScrollHeight) {
            clearInterval(checkFinished);
            finished = true;
        }
    }, CHECK_INTERVAL_MILLIS);
    const doScroll = async () => {
        /* istanbul ignore next */
        const bodyScrollHeight = await page.evaluate(() => document.body.scrollHeight);
        const delta = bodyScrollHeight === 0 ? SCROLL_HEIGHT_IF_ZERO : bodyScrollHeight;
        await page.mouse.wheel({ deltaY: delta });
        scrolledDistance += delta;
    };
    const maybeClickButton = async () => {
        const button = await page.$(buttonSelector);
        // Box model returns null if the button is not visible
        if (button && (await button.boxModel())) {
            await button.click({ delay: 10 });
        }
    };
    while (!finished) {
        await doScroll();
        await sleep(250);
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
/**
 * Saves a full screenshot and HTML of the current page into a Key-Value store.
 * @param page Puppeteer [`Page`](https://pptr.dev/api/puppeteer.page) object.
 * @param [options]
 */
export async function saveSnapshot(page, options = {}) {
    parseArgument(page, validators.browserPage);
    const { key, screenshotQuality, saveScreenshot, saveHtml, keyValueStoreName, configuration } = parseArgument(options, saveSnapshotOptionsSchema);
    try {
        const store = await KeyValueStore.open(keyValueStoreName ? { name: keyValueStoreName } : null, {
            configuration: configuration ?? Configuration.getGlobalConfiguration(),
        });
        if (saveScreenshot) {
            const screenshotName = `${key}.jpg`;
            const screenshotBuffer = await page.screenshot({
                fullPage: true,
                quality: screenshotQuality,
                type: 'jpeg',
            });
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
let idcacPlaywright = null;
async function getIdcacPlaywright() {
    if (idcacPlaywright)
        return idcacPlaywright;
    try {
        idcacPlaywright = await import('idcac-playwright');
    }
    catch (error) {
        getLog().warning(`Failed to import 'idcac-playwright'.

We recently made idcac-playwright an optional dependency due to licensing issues.
To use this feature, please install it manually by running

npm install idcac-playwright

Original error message follows:

${error.message}
`);
    }
    return idcacPlaywright;
}
export async function closeCookieModals(page) {
    parseArgument(page, validators.browserPage);
    const idcac = await getIdcacPlaywright();
    if (idcac?.getInjectableScript()) {
        await page.evaluate(idcac.getInjectableScript());
    }
}
export { enqueueLinksByClickingElements, addInterceptRequestHandler, removeInterceptRequestHandler };
/** @internal */
export const puppeteerUtils = {
    injectFile,
    injectJQuery,
    enqueueLinksByClickingElements,
    blockRequests,
    compileScript,
    gotoExtended,
    addInterceptRequestHandler,
    removeInterceptRequestHandler,
    infiniteScroll,
    saveSnapshot,
    parseWithCheerio,
    closeCookieModals,
};
