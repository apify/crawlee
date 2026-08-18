/**
 * A namespace that contains various utilities for
 * [Playwright](https://github.com/microsoft/playwright) - the headless Chrome Node API.
 *
 * **Example usage:**
 *
 * ```javascript
 * import { launchPlaywright, playwrightUtils } from 'crawlee';
 *
 * // Navigate to https://www.example.com in Playwright with a POST request
 * const browser = await launchPlaywright();
 * const page = await browser.newPage();
 * await playwrightUtils.gotoExtended(page, {
 *     url: 'https://example.com,
 *     method: 'POST',
 * });
 * ```
 * @module playwrightUtils
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { Configuration, KeyValueStore, serviceLocator, SessionError, validators } from '@crawlee/browser';
import { expandShadowRoots, sleep } from '@crawlee/utils';
import { parseArgument, schemas } from '@crawlee/utils/internal';
import { z } from 'zod';
import { LruCache } from '@apify/datastructures';
import { enqueueLinksByClickingElements } from '../enqueue-links/click-elements.js';
import { RenderingTypePredictor } from './rendering-type-prediction.js';
const getLog = () => serviceLocator.getChildLog('Playwright Utils');
const require = createRequire(import.meta.url);
const jqueryPath = require.resolve('jquery');
const MAX_INJECT_FILE_CACHE_SIZE = 10;
const DEFAULT_BLOCK_REQUEST_URL_PATTERNS = ['.css', '.jpg', '.jpeg', '.png', '.svg', '.gif', '.woff', '.pdf', '.zip'];
const filePathSchema = z.string();
const injectFileOptionsSchema = z.strictObject({
    surviveNavigations: z.boolean().optional(),
});
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
/**
 * Cache contents of previously injected files to limit file system access.
 */
const injectedFilesCache = new LruCache({ maxLength: MAX_INJECT_FILE_CACHE_SIZE });
/**
 * Injects a JavaScript file into a Playwright page.
 * Unlike Playwright's `addScriptTag` function, this function works on pages
 * with arbitrary Cross-Origin Resource Sharing (CORS) policies.
 *
 * File contents are cached for up to 10 files to limit file system access.
 *
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
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
 * Injects the [jQuery](https://jquery.com/) library into a Playwright page.
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
 * await playwrightUtils.injectJQuery(page);
 * const title = await page.evaluate(() => {
 *   return $('head title').text();
 * });
 * ```
 *
 * Note that `injectJQuery()` does not affect the Playwright
 * [`page.$()`](https://playwright.dev/docs/api/class-page#page-query-selector)
 * function in any way.
 *
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param [options.surviveNavigations] Opt-out option to disable the JQuery reinjection after navigation.
 */
export async function injectJQuery(page, options) {
    parseArgument(page, validators.browserPage);
    return injectFile(page, jqueryPath, { surviveNavigations: options?.surviveNavigations ?? true });
}
/**
 * Extended version of Playwright's `page.goto()` allowing to perform requests with HTTP method other than GET,
 * with custom headers and POST payload. URL, method, headers and payload are taken from
 * request parameter that must be an instance of Request class.
 *
 * *NOTE:* In recent versions of Playwright using requests other than GET, overriding headers and adding payloads disables
 * browser cache which degrades performance.
 *
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param request
 * @param [gotoOptions] Custom options for `page.goto()`.
 */
export async function gotoExtended(page, request, gotoOptions = {}) {
    parseArgument(page, validators.browserPage);
    parseArgument(request, gotoExtendedRequestSchema);
    parseArgument(gotoOptions, schemas.anyObject);
    const { url, method, headers, payload } = request;
    const isEmpty = (o) => !o || Object.keys(o).length === 0;
    if (method !== 'GET' || payload) {
        // This is not deprecated, we use it to log only once.
        getLog().deprecated('Using other request methods than GET, rewriting headers and adding payloads has a high impact on performance ' +
            'in recent versions of Playwright. Use only when necessary.');
        let wasCalled = false;
        const interceptRequestHandler = async (route) => {
            try {
                // We want to ensure that this won't get executed again in a case that there is a subsequent request
                // for example for some asset file link from main HTML.
                if (wasCalled) {
                    return await route.continue();
                }
                wasCalled = true;
                const overrides = {};
                if (method !== 'GET')
                    overrides.method = method;
                if (payload)
                    overrides.postData = payload;
                if (!isEmpty(headers))
                    overrides.headers = headers;
                await route.continue(overrides);
            }
            catch (error) {
                getLog().debug('Error inside request interceptor', { error });
            }
            return undefined;
        };
        await page.route('**/*', interceptRequestHandler);
    }
    else if (!isEmpty(headers)) {
        await page.setExtraHTTPHeaders(headers);
    }
    return page.goto(url, gotoOptions);
}
/**
 * > This is a **Chromium-only feature.**
 * >
 * > Using this option with Firefox and WebKit browsers doesn't have any effect.
 * > To set up request blocking for these browsers, use `page.route()` instead.
 *
 * Forces the Playwright browser tab to block loading URLs that match a provided pattern.
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
 * This function does not use Playwright's request interception and therefore does not interfere
 * with browser cache. It's also faster than blocking requests using interception,
 * because the blocking happens directly in the browser without the round-trip to Node.js,
 * but it does not provide the extra benefits of request interception.
 *
 * The function will never block main document loads and their respective redirects.
 *
 * **Example usage**
 * ```javascript
 * import { launchPlaywright, playwrightUtils } from 'crawlee';
 *
 * const browser = await launchPlaywright();
 * const page = await browser.newPage();
 *
 * // Block all requests to URLs that include `adsbygoogle.js` and also all defaults.
 * await playwrightUtils.blockRequests(page, {
 *     extraUrlPatterns: ['adsbygoogle.js'],
 * });
 *
 * await page.goto('https://cnn.com');
 * ```
 *
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param [options]
 */
export async function blockRequests(page, options = {}) {
    parseArgument(page, validators.browserPage);
    const { urlPatterns, extraUrlPatterns } = parseArgument(options, blockRequestsOptionsSchema);
    const patternsToBlock = [...urlPatterns, ...extraUrlPatterns];
    try {
        const client = await page.context().newCDPSession(page);
        await client.send('Network.enable');
        await client.send('Network.setBlockedURLs', { urls: patternsToBlock });
    }
    catch {
        getLog().warning('blockRequests() helper is incompatible with non-Chromium browsers.');
    }
}
/**
 * Compiles a Playwright script into an async function that may be executed at any time
 * by providing it with the following object:
 * ```
 * {
 *    page: Page,
 *    request: Request,
 * }
 * ```
 * Where `page` is a Playwright [`Page`](https://playwright.dev/docs/api/class-page)
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
 * Scrolls to the bottom of a page, or until it times out.
 * Loads dynamic content when it hits the bottom of a page, and then continues scrolling.
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
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
        if (maxScrollHeight > 0 && scrolledDistance >= maxScrollHeight) {
            clearInterval(checkFinished);
            finished = true;
        }
    }, CHECK_INTERVAL_MILLIS);
    const doScroll = async () => {
        const bodyScrollHeight = await page.evaluate(() => document.body.scrollHeight);
        const delta = bodyScrollHeight === 0 ? SCROLL_HEIGHT_IF_ZERO : bodyScrollHeight;
        await page.mouse.wheel(0, delta);
        scrolledDistance += delta;
    };
    const maybeClickButton = async () => {
        const button = await page.$(buttonSelector);
        // Box model returns null if the button is not visible
        if (button && (await button.boundingBox())) {
            await button.click({ delay: 10 });
        }
    };
    while (!finished) {
        await doScroll();
        await page.waitForTimeout(250);
        if (scrollDownAndUp) {
            await page.mouse.wheel(0, -100);
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
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
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
                animations: 'disabled',
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
/**
 * Returns Cheerio handle for `page.content()`, allowing to work with the data same way as with {@apilink CheerioCrawler}.
 *
 * **Example usage:**
 * ```javascript
 * const $ = await playwrightUtils.parseWithCheerio(page);
 * const title = $('title').text();
 * ```
 *
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param ignoreShadowRoots
 */
export async function parseWithCheerio(page, ignoreShadowRoots = false, ignoreIframes = false) {
    parseArgument(page, validators.browserPage);
    const html = ignoreShadowRoots
        ? null
        : (await page.evaluate(`(${expandShadowRoots.toString()})(document)`));
    const pageContent = html || (await page.content());
    const { load } = await import('cheerio');
    const $ = load(pageContent);
    if (page.frames().length > 1 && !ignoreIframes) {
        const frames = await page.$$('iframe');
        const cheerioIframes = $('iframe').toArray();
        if (frames.length !== cheerioIframes.length) {
            serviceLocator
                .getLogger()
                .warning(`parseWithCheerio: iframe count mismatch between live DOM (${frames.length}) and page snapshot (${cheerioIframes.length}). Some iframes may not be expanded.`);
        }
        await Promise.all(frames.map(async (frame, index) => {
            try {
                const iframe = await frame.contentFrame();
                if (iframe && cheerioIframes[index]) {
                    const getIframeHTML = async () => {
                        try {
                            return iframe.locator('body').first().innerHTML();
                        }
                        catch {
                            return iframe.content();
                        }
                    };
                    const contents = await getIframeHTML();
                    $(cheerioIframes[index]).replaceWith(`<div class="crawlee-iframe-replacement">${contents}</div>`);
                }
            }
            catch (error) {
                getLog().warning(`Failed to extract iframe content: ${error}`);
            }
        }));
    }
    return $;
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
/**
 * This helper tries to solve the Cloudflare challenge automatically by clicking on the checkbox.
 * It will try to detect the Cloudflare page, click on the checkbox, and wait for 10 seconds (configurable
 * via `sleepSecs` option) for the page to load. Use this in the `postNavigationHooks`, a failures will
 * result in a SessionError which will be automatically retried, so only successful requests will get
 * into the `requestHandler`.
 *
 * On a successfully solved challenge the page is reloaded and the new {@apilink Response} is returned, so
 * it can be propagated back to the crawling context via a hook return value (see
 * {@apilink handleCloudflareChallengeHook}).
 *
 * Works best with camoufox.
 *
 * **Example usage**
 * ```ts
 * postNavigationHooks: [
 *     async (context) => ({ response: await context.handleCloudflareChallenge() }),
 * ],
 * ```
 *
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object
 * @param url current URL for request identification, only used for logging
 * @param [options]
 */
async function handleCloudflareChallenge(page, url, options = {}) {
    options.isBlockedCallback ??= async () => {
        const isBlocked = await page.evaluate(() => {
            return document.querySelector('h1')?.textContent?.trim().includes('Sorry, you have been blocked');
        });
        return !!isBlocked;
    };
    options.isChallengeCallback ??= async () => {
        return await page.evaluate(async () => {
            // Cloudflare keeps reshuffling the wrapper elements between `.footer-inner` and `.ray-id`,
            // so only the stable outer classes are matched.
            return !!document.querySelector('.footer .footer-inner .ray-id');
        });
    };
    const retryBlocked = async () => {
        const isBlocked = await options.isBlockedCallback(page).catch(() => false);
        if (isBlocked) {
            throw new SessionError(`Blocked by Cloudflare when processing ${url}`);
        }
    };
    // check if we ended up on the CF challenge page
    const isChallenge = async () => {
        return options.isChallengeCallback(page).catch(() => false);
    };
    if (!(await isChallenge())) {
        await retryBlocked();
        return undefined;
    }
    const logLevel = options.verbose ? 'info' : 'debug';
    getLog()[logLevel](`Detected Cloudflare challenge at ${url}, trying to solve it. This can take up to ${10 + (options.sleepSecs ?? 10)} seconds.`);
    const bb = await page
        .evaluate(() => {
        // Prefer the actual challenge widget (the box holding the Turnstile checkbox input);
        // fall back to the first content div for older challenge layouts.
        const div = document.querySelector('.main-content div:has(input[id^="cf-chl-widget-"])') ??
            document.querySelector('.main-content div');
        return div?.getBoundingClientRect();
    })
        .catch(() => undefined);
    if (!bb) {
        return undefined;
    }
    const randomOffset = (range) => {
        return Math.round(100 * range * Math.random()) / 100;
    };
    let x = bb.x + 30;
    let y = bb.y + 25;
    // try to click the checkbox every second
    for (let i = 0; i < 10; i++) {
        await sleep((options.preChallengeSleepSecs ?? 1) * 1000);
        // break early if we are no longer on the CF challenge page
        if (!(await isChallenge())) {
            break;
        }
        if (options.clickPositionCallback) {
            const pos = await options.clickPositionCallback(page);
            if (pos) {
                x = pos.x;
                y = pos.y;
            }
        }
        if (options.clickCallback) {
            await options.clickCallback(page, { x, y });
            continue;
        }
        // we can click on the text too, so X can be a bit larger
        const xRandomized = x + randomOffset(10);
        const yRandomized = y + randomOffset(10);
        getLog()[logLevel](`Trying to click on the Cloudflare checkbox at ${url}`, {
            x: xRandomized,
            y: yRandomized,
        });
        await page.mouse.click(xRandomized, yRandomized);
        // sometimes the checkbox is lower (could be caused by a lag when rendering the logo)
        await page.mouse.click(xRandomized, yRandomized + 35);
    }
    await sleep((options.sleepSecs ?? 10) * 1000);
    if (await isChallenge()) {
        throw new SessionError(`Blocked by Cloudflare when processing ${url}`);
    }
    await retryBlocked();
    // Reload to obtain a fresh Response without the challenge interstitial, which the caller can
    // propagate back into the crawling context so downstream status-code checks see the new value.
    return (await page.reload()) ?? undefined;
}
export { enqueueLinksByClickingElements };
/** @internal */
export const playwrightUtils = {
    injectFile,
    injectJQuery,
    gotoExtended,
    blockRequests,
    enqueueLinksByClickingElements,
    parseWithCheerio,
    infiniteScroll,
    saveSnapshot,
    compileScript,
    closeCookieModals,
    RenderingTypePredictor,
    handleCloudflareChallenge,
};
