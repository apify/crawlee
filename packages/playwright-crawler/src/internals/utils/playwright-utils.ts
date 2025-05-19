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

import {
    Configuration,
    KeyValueStore,
    type Request,
    RequestState,
    type Session,
    SessionError,
    validators,
} from '@crawlee/browser';
import type { BatchAddRequestsResult } from '@crawlee/types';
import { type CheerioRoot, type Dictionary, expandShadowRoots, sleep } from '@crawlee/utils';
import * as cheerio from 'cheerio';
import { getInjectableScript as getCookieClosingScript } from 'idcac-playwright';
import ow from 'ow';
import type { Page, Response, Route } from 'playwright';

import { LruCache } from '@apify/datastructures';
import log_ from '@apify/log';

import type { EnqueueLinksByClickingElementsOptions } from '../enqueue-links/click-elements.js';
import { enqueueLinksByClickingElements } from '../enqueue-links/click-elements.js';
import type { PlaywrightCrawlerOptions, PlaywrightCrawlingContext } from '../playwright-crawler.js';
import { RenderingTypePredictor } from './rendering-type-prediction.js';

const log = log_.child({ prefix: 'Playwright Utils' });

const require = createRequire(import.meta.url);
const jqueryPath = require.resolve('jquery');

const MAX_INJECT_FILE_CACHE_SIZE = 10;
const DEFAULT_BLOCK_REQUEST_URL_PATTERNS = ['.css', '.jpg', '.jpeg', '.png', '.svg', '.gif', '.woff', '.pdf', '.zip'];

export interface InjectFileOptions {
    /**
     * Enables the injected script to survive page navigations and reloads without need to be re-injected manually.
     * This does not mean, however, that internal state will be preserved. Just that it will be automatically
     * re-injected on each navigation before any other scripts get the chance to execute.
     */
    surviveNavigations?: boolean;
}

export interface BlockRequestsOptions {
    /**
     * The patterns of URLs to block from being loaded by the browser.
     * Only `*` can be used as a wildcard. It is also automatically added to the beginning
     * and end of the pattern. This limitation is enforced by the DevTools protocol.
     * `.png` is the same as `*.png*`.
     */
    urlPatterns?: string[];

    /**
     * If you just want to append to the default blocked patterns, use this property.
     */
    extraUrlPatterns?: string[];
}

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
export async function injectFile(page: Page, filePath: string, options: InjectFileOptions = {}): Promise<unknown> {
    ow(page, ow.object.validate(validators.browserPage));
    ow(filePath, ow.string);
    ow(
        options,
        ow.object.exactShape({
            surviveNavigations: ow.optional.boolean,
        }),
    );

    let contents = injectedFilesCache.get(filePath);
    if (!contents) {
        contents = await readFile(filePath, 'utf8');
        injectedFilesCache.add(filePath, contents);
    }
    const evalP = page.evaluate(contents);

    if (options.surviveNavigations) {
        page.on('framenavigated', async () =>
            page
                .evaluate(contents)
                .catch((error) => log.warning('An error occurred during the script injection!', { error })),
        );
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
export async function injectJQuery(page: Page, options?: { surviveNavigations?: boolean }): Promise<unknown> {
    ow(page, ow.object.validate(validators.browserPage));
    return injectFile(page, jqueryPath, { surviveNavigations: options?.surviveNavigations ?? true });
}

export interface DirectNavigationOptions {
    /**
     * Maximum operation time in milliseconds, defaults to 30 seconds, pass `0` to disable timeout. The
     * default value can be changed by using the browserContext.setDefaultNavigationTimeout(timeout),
     * browserContext.setDefaultTimeout(timeout), page.setDefaultNavigationTimeout(timeout) or
     * page.setDefaultTimeout(timeout) methods.
     */
    timeout?: number;

    /**
     * When to consider operation succeeded, defaults to `load`. Events can be either:
     * - `'domcontentloaded'` - consider operation to be finished when the `DOMContentLoaded` event is fired.
     * - `'load'` - consider operation to be finished when the `load` event is fired.
     * - `'networkidle'` - consider operation to be finished when there are no network connections for at least `500` ms.
     */
    waitUntil?: 'domcontentloaded' | 'load' | 'networkidle';

    /**
     * Referer header value. If provided it will take preference over the referer header value set by page.setExtraHTTPHeaders(headers).
     */
    referer?: string;
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
export async function gotoExtended(
    page: Page,
    request: Request,
    gotoOptions: DirectNavigationOptions = {},
): Promise<Response | null> {
    ow(page, ow.object.validate(validators.browserPage));
    ow(
        request,
        ow.object.partialShape({
            url: ow.string.url,
            method: ow.optional.string,
            headers: ow.optional.object,
            payload: ow.optional.any(ow.string, ow.uint8Array),
        }),
    );
    ow(gotoOptions, ow.object);

    const { url, method, headers, payload } = request;
    const isEmpty = (o?: object) => !o || Object.keys(o).length === 0;

    if (method !== 'GET' || payload || !isEmpty(headers)) {
        // This is not deprecated, we use it to log only once.
        log.deprecated(
            'Using other request methods than GET, rewriting headers and adding payloads has a high impact on performance ' +
                'in recent versions of Playwright. Use only when necessary.',
        );
        let wasCalled = false;
        const interceptRequestHandler = async (route: Route) => {
            try {
                // We want to ensure that this won't get executed again in a case that there is a subsequent request
                // for example for some asset file link from main HTML.
                if (wasCalled) {
                    return await route.continue();
                }

                wasCalled = true;
                const overrides: Dictionary = {};

                if (method !== 'GET') overrides.method = method;
                if (payload) overrides.postData = payload;
                if (!isEmpty(headers)) overrides.headers = headers;
                await route.continue(overrides);
            } catch (error) {
                log.debug('Error inside request interceptor', { error });
            }

            return undefined;
        };

        await page.route('**/*', interceptRequestHandler);
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
export async function blockRequests(page: Page, options: BlockRequestsOptions = {}): Promise<void> {
    ow(page, ow.object.validate(validators.browserPage));
    ow(
        options,
        ow.object.exactShape({
            urlPatterns: ow.optional.array.ofType(ow.string),
            extraUrlPatterns: ow.optional.array.ofType(ow.string),
        }),
    );

    const { urlPatterns = DEFAULT_BLOCK_REQUEST_URL_PATTERNS, extraUrlPatterns = [] } = options;

    const patternsToBlock = [...urlPatterns, ...extraUrlPatterns];

    try {
        const client = await page.context().newCDPSession(page);

        await client.send('Network.enable');
        await client.send('Network.setBlockedURLs', { urls: patternsToBlock });
    } catch {
        log.warning('blockRequests() helper is incompatible with non-Chromium browsers.');
    }
}

export interface CompiledScriptParams {
    page: Page;
    request: Request;
}

export type CompiledScriptFunction = (params: CompiledScriptParams) => Promise<unknown>;

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
export function compileScript(scriptString: string, context: Dictionary = Object.create(null)): CompiledScriptFunction {
    const funcString = `async ({ page, request }) => {${scriptString}}`;

    let func;
    try {
        func = vm.runInNewContext(funcString, context); // "Secure" the context by removing prototypes, unless custom context is provided.
    } catch (err) {
        log.exception(err as Error, 'Cannot compile script!');
        throw err;
    }

    if (typeof func !== 'function') throw new Error('Compilation result is not a function!'); // This should not happen...

    return func;
}

export interface InfiniteScrollOptions {
    /**
     * How many seconds to scroll for. If 0, will scroll until bottom of page.
     * @default 0
     */
    timeoutSecs?: number;

    /**
     * How many pixels to scroll down. If 0, will scroll until bottom of page.
     * @default 0
     */
    maxScrollHeight?: number;

    /**
     * How many seconds to wait for no new content to load before exit.
     * @default 4
     */
    waitForSecs?: number;

    /**
     * If true, it will scroll up a bit after each scroll down. This is required on some websites for the scroll to work.
     * @default false
     */
    scrollDownAndUp?: boolean;

    /**
     * Optionally checks and clicks a button if it appears while scrolling. This is required on some websites for the scroll to work.
     */
    buttonSelector?: string;

    /**
     * This function is called after every scroll and stops the scrolling process if it returns `true`. The function can be `async`.
     */
    stopScrollCallback?: () => unknown | Promise<unknown>;
}

/**
 * Scrolls to the bottom of a page, or until it times out.
 * Loads dynamic content when it hits the bottom of a page, and then continues scrolling.
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param [options]
 */
export async function infiniteScroll(page: Page, options: InfiniteScrollOptions = {}): Promise<void> {
    ow(page, ow.object.validate(validators.browserPage));
    ow(
        options,
        ow.object.exactShape({
            timeoutSecs: ow.optional.number,
            maxScrollHeight: ow.optional.number,
            waitForSecs: ow.optional.number,
            scrollDownAndUp: ow.optional.boolean,
            buttonSelector: ow.optional.string,
            stopScrollCallback: ow.optional.function,
        }),
    );

    const {
        timeoutSecs = 0,
        maxScrollHeight = 0,
        waitForSecs = 4,
        scrollDownAndUp = false,
        buttonSelector,
        stopScrollCallback,
    } = options;

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
        } else {
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
        const button = await page.$(buttonSelector!);
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

export interface SaveSnapshotOptions {
    /**
     * Key under which the screenshot and HTML will be saved. `.jpg` will be appended for screenshot and `.html` for HTML.
     * @default 'SNAPSHOT'
     */
    key?: string;

    /**
     * The quality of the image, between 0-100. Higher quality images have bigger size and require more storage.
     * @default 50
     */
    screenshotQuality?: number;

    /**
     * If true, it will save a full screenshot of the current page as a record with `key` appended by `.jpg`.
     * @default true
     */
    saveScreenshot?: boolean;

    /**
     * If true, it will save a full HTML of the current page as a record with `key` appended by `.html`.
     * @default true
     */
    saveHtml?: boolean;

    /**
     * Name or id of the Key-Value store where snapshot is saved. By default it is saved to default Key-Value store.
     * @default null
     */
    keyValueStoreName?: string | null;

    /**
     * Configuration of the crawler that will be used to save the snapshot.
     * @default Configuration.getGlobalConfig()
     */
    config?: Configuration;
}

/**
 * Saves a full screenshot and HTML of the current page into a Key-Value store.
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param [options]
 */
export async function saveSnapshot(page: Page, options: SaveSnapshotOptions = {}): Promise<void> {
    ow(page, ow.object.validate(validators.browserPage));
    ow(
        options,
        ow.object.exactShape({
            key: ow.optional.string.nonEmpty,
            screenshotQuality: ow.optional.number,
            saveScreenshot: ow.optional.boolean,
            saveHtml: ow.optional.boolean,
            keyValueStoreName: ow.optional.string,
            config: ow.optional.object,
        }),
    );

    const {
        key = 'SNAPSHOT',
        screenshotQuality = 50,
        saveScreenshot = true,
        saveHtml = true,
        keyValueStoreName,
        config,
    } = options;

    try {
        const store = await KeyValueStore.open(keyValueStoreName, {
            config: config ?? Configuration.getGlobalConfig(),
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
    } catch (err) {
        throw new Error(`saveSnapshot with key ${key} failed.\nCause:${(err as Error).message}`);
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
export async function parseWithCheerio(
    page: Page,
    ignoreShadowRoots = false,
    ignoreIframes = false,
): Promise<CheerioRoot> {
    ow(page, ow.object.validate(validators.browserPage));

    if (page.frames().length > 1 && !ignoreIframes) {
        const frames = await page.$$('iframe');

        await Promise.all(
            frames.map(async (frame) => {
                try {
                    const iframe = await frame.contentFrame();

                    if (iframe) {
                        const contents = await iframe.content();

                        await frame.evaluate((f, c) => {
                            const replacementNode = document.createElement('div');
                            replacementNode.innerHTML = c;
                            replacementNode.className = 'crawlee-iframe-replacement';

                            f.replaceWith(replacementNode);
                        }, contents);
                    }
                } catch (error) {
                    log.warning(`Failed to extract iframe content: ${error}`);
                }
            }),
        );
    }

    const html = ignoreShadowRoots
        ? null
        : ((await page.evaluate(`(${expandShadowRoots.toString()})(document)`)) as string);
    const pageContent = html || (await page.content());
    console.log(ignoreShadowRoots, pageContent);

    return cheerio.load(pageContent);
}

export async function closeCookieModals(page: Page): Promise<void> {
    ow(page, ow.object.validate(validators.browserPage));

    await page.evaluate(getCookieClosingScript());
}

interface HandleCloudflareChallengeOptions {
    /** Logging defaults to the `debug` level, use this flag to log to `info` level instead. */
    verbose?: boolean;
    /** How long should we wait after the challenge is completed for the final page to load. */
    sleepSecs?: number;
    /** Allows overriding the checkbox clicking. The `boundingBox` gives you approximate coordinates of the checkbox, use this if you need to adjust the click position. */
    clickCallback?: (page: Page, boundingBox: { x: number; y: number }) => Promise<void>;
    /** Allows overriding the detection of Cloudflare "challenge page". */
    isChallengeCallback?: (page: Page) => Promise<boolean>;
    /** Allows overriding the detection of Cloudflare "blocked page". */
    isBlockedCallback?: (page: Page) => Promise<boolean>;
}

/**
 * This helper tries to solve the Cloudflare challenge automatically by clicking on the checkbox.
 * It will try to detect the Cloudflare page, click on the checkbox, and wait for 10 seconds (configurable
 * via `sleepSecs` option) for the page to load. Use this in the `postNavigationHooks`, a failures will
 * result in a SessionError which will be automatically retried, so only successful requests will get
 * into the `requestHandler`.
 *
 * Works best with camoufox.
 *
 * **Example usage**
 * ```ts
 * postNavigationHooks: [
 *     async ({ handleCloudflareChallenge }) => {
 *         await handleCloudflareChallenge();
 *     },
 * ],
 * ```
 *
 * @param page Playwright [`Page`](https://playwright.dev/docs/api/class-page) object
 * @param url current URL for request identification, only used for logging
 * @param [session] current session object
 * @param [options]
 */
async function handleCloudflareChallenge(
    page: Page,
    url: string,
    session?: Session,
    options: HandleCloudflareChallengeOptions = {},
): Promise<void> {
    // eslint-disable-next-line dot-notation
    const blockedStatusCodes = session?.['sessionPool']['blockedStatusCodes'] as number[];

    // Cloudflare pages are 403, which are blocked by default
    if (blockedStatusCodes?.includes(403)) {
        const idx = blockedStatusCodes.indexOf(403);
        blockedStatusCodes.splice(idx, 1);
    }

    options.isBlockedCallback ??= async () => {
        const isBlocked = await page.evaluate(() => {
            return document.querySelector('h1')?.textContent?.trim().includes('Sorry, you have been blocked');
        });
        return !!isBlocked;
    };

    options.isChallengeCallback ??= async () => {
        return await page.evaluate(async () => {
            return !!document.querySelector('.footer > .footer-inner > .diagnostic-wrapper > .ray-id');
        });
    };

    const retryBlocked = async () => {
        const isBlocked = await options.isBlockedCallback!(page).catch(() => false);

        if (isBlocked) {
            throw new SessionError(`Blocked by Cloudflare when processing ${url}`);
        }
    };

    // check if we ended up on the CF challenge page
    const isChallenge = async () => {
        return options.isChallengeCallback!(page).catch(() => false);
    };

    if (!(await isChallenge())) {
        await retryBlocked();
        return;
    }

    const logLevel = options.verbose ? 'info' : 'debug';
    log[logLevel](
        `Detected Cloudflare challenge at ${url}, trying to solve it. This can take up to ${10 + (options.sleepSecs ?? 10)} seconds.`,
    );

    const bb = await page
        .evaluate(() => {
            const div = document.querySelector('.main-content div');
            return div?.getBoundingClientRect();
        })
        .catch(() => undefined);

    if (!bb) {
        return;
    }

    const randomOffset = (range: number) => {
        return Math.round(100 * range * Math.random()) / 100;
    };

    const x = bb.x + 30;
    const y = bb.y + 25;

    // try to click the checkbox every second
    for (let i = 0; i < 10; i++) {
        await sleep(1000);

        // break early if we are no longer on the CF challenge page
        if (!(await isChallenge())) {
            break;
        }

        if (options.clickCallback) {
            await options.clickCallback(page, { x, y });
            continue;
        }

        // we can click on the text too, so X can be a bit larger
        const xRandomized = x + randomOffset(10);
        const yRandomized = y + randomOffset(10);

        log[logLevel](`Trying to click on the Cloudflare checkbox at ${url}`, { x: xRandomized, y: yRandomized });
        await page.mouse.click(xRandomized, yRandomized);

        // sometimes the checkbox is lower (could be caused by a lag when rendering the logo)
        await page.mouse.click(xRandomized, yRandomized + 35);
    }

    await sleep((options.sleepSecs ?? 10) * 1000);

    if (await isChallenge()) {
        throw new SessionError(`Blocked by Cloudflare when processing ${url}`);
    }

    await retryBlocked();
}

/** @internal */
export interface PlaywrightContextUtils {
    /**
     * Injects a JavaScript file into current `page`.
     * Unlike Playwright's `addScriptTag` function, this function works on pages
     * with arbitrary Cross-Origin Resource Sharing (CORS) policies.
     *
     * File contents are cached for up to 10 files to limit file system access.
     */
    injectFile(filePath: string, options?: InjectFileOptions): Promise<unknown>;

    /**
     * Injects the [jQuery](https://jquery.com/) library into current `page`.
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
     * async requestHandler({ page, injectJQuery }) {
     *     await injectJQuery();
     *     const title = await page.evaluate(() => {
     *         return $('head title').text();
     *     });
     * });
     * ```
     *
     * Note that `injectJQuery()` does not affect the Playwright
     * [`page.$()`](https://playwright.dev/docs/api/class-page#page-query-selector)
     * function in any way.
     */
    injectJQuery(): Promise<unknown>;

    /**
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
     * preNavigationHooks: [
     *     async ({ blockRequests }) => {
     *         // Block all requests to URLs that include `adsbygoogle.js` and also all defaults.
     *         await blockRequests({
     *             extraUrlPatterns: ['adsbygoogle.js'],
     *         });
     *     },
     * ],
     * ```
     */
    blockRequests(options?: BlockRequestsOptions): Promise<void>;

    /**
     * Wait for an element matching the selector to appear.
     * Timeout defaults to 5s.
     *
     * **Example usage:**
     * ```ts
     * async requestHandler({ waitForSelector, parseWithCheerio }) {
     *     await waitForSelector('article h1');
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    waitForSelector(selector: string, timeoutMs?: number): Promise<void>;

    /**
     * Returns Cheerio handle for `page.content()`, allowing to work with the data same way as with {@apilink CheerioCrawler}.
     * When provided with the `selector` argument, it waits for it to be available first.
     *
     * **Example usage:**
     * ```ts
     * async requestHandler({ parseWithCheerio }) {
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    parseWithCheerio(selector?: string, timeoutMs?: number): Promise<CheerioRoot>;

    /**
     * Scrolls to the bottom of a page, or until it times out.
     * Loads dynamic content when it hits the bottom of a page, and then continues scrolling.
     */
    infiniteScroll(options?: InfiniteScrollOptions): Promise<void>;

    /**
     * Saves a full screenshot and HTML of the current page into a Key-Value store.
     * @param [options]
     */
    saveSnapshot(options?: SaveSnapshotOptions): Promise<void>;

    /**
     * The function finds elements matching a specific CSS selector in a Playwright page,
     * clicks all those elements using a mouse move and a left mouse button click and intercepts
     * all the navigation requests that are subsequently produced by the page. The intercepted
     * requests, including their methods, headers and payloads are then enqueued to a provided
     * {@apilink RequestQueue}. This is useful to crawl JavaScript heavy pages where links are not available
     * in `href` elements, but rather navigations are triggered in click handlers.
     * If you're looking to find URLs in `href` attributes of the page, see {@apilink enqueueLinks}.
     *
     * Optionally, the function allows you to filter the target links' URLs using an array of {@apilink PseudoUrl} objects
     * and override settings of the enqueued {@apilink Request} objects.
     *
     * **IMPORTANT**: To be able to do this, this function uses various mutations on the page,
     * such as changing the Z-index of elements being clicked and their visibility. Therefore,
     * it is recommended to only use this function as the last operation in the page.
     *
     * **USING HEADFUL BROWSER**: When using a headful browser, this function will only be able to click elements
     * in the focused tab, effectively limiting concurrency to 1. In headless mode, full concurrency can be achieved.
     *
     * **PERFORMANCE**: Clicking elements with a mouse and intercepting requests is not a low level operation
     * that takes nanoseconds. It's not very CPU intensive, but it takes time. We strongly recommend limiting
     * the scope of the clicking as much as possible by using a specific selector that targets only the elements
     * that you assume or know will produce a navigation. You can certainly click everything by using
     * the `*` selector, but be prepared to wait minutes to get results on a large and complex page.
     *
     * **Example usage**
     *
     * ```javascript
     * async requestHandler({ enqueueLinksByClickingElements }) {
     *     await enqueueLinksByClickingElements({
     *         selector: 'a.product-detail',
     *         globs: [
     *             'https://www.example.com/handbags/**'
     *             'https://www.example.com/purses/**'
     *         ],
     *     });
     * });
     * ```
     *
     * @returns Promise that resolves to {@apilink BatchAddRequestsResult} object.
     */
    enqueueLinksByClickingElements(
        options: Omit<EnqueueLinksByClickingElementsOptions, 'page' | 'requestQueue'>,
    ): Promise<BatchAddRequestsResult>;

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
    compileScript(scriptString: string, ctx?: Dictionary): CompiledScriptFunction;

    /**
     * Tries to close cookie consent modals on the page. Based on the I Don't Care About Cookies browser extension.
     */
    closeCookieModals(): Promise<void>;

    /**
     * This helper tries to solve the Cloudflare challenge automatically by clicking on the checkbox.
     * It will try to detect the Cloudflare page, click on the checkbox, and wait for 10 seconds (configurable
     * via `sleepSecs` option) for the page to load. Use this in the `postNavigationHooks`, a failures will
     * result in a SessionError which will be automatically retried, so only successful requests will get
     * into the `requestHandler`.
     *
     * Works best with camoufox.
     *
     * **Example usage**
     * ```ts
     * postNavigationHooks: [
     *     async ({ handleCloudflareChallenge }) => {
     *         await handleCloudflareChallenge();
     *     },
     * ],
     * ```
     *
     * @param [options]
     */
    handleCloudflareChallenge(options?: HandleCloudflareChallengeOptions): Promise<void>;
}

export function registerUtilsToContext(
    context: PlaywrightCrawlingContext,
    crawlerOptions: PlaywrightCrawlerOptions,
): void {
    context.injectFile = async (filePath: string, options?: InjectFileOptions) =>
        injectFile(context.page, filePath, options);
    context.injectJQuery = async () => {
        if (context.request.state === RequestState.BEFORE_NAV) {
            log.warning(
                'Using injectJQuery() in preNavigationHooks leads to unstable results. Use it in a postNavigationHook or a requestHandler instead.',
            );
            await injectJQuery(context.page);
            return;
        }
        await injectJQuery(context.page, { surviveNavigations: false });
    };
    context.blockRequests = async (options?: BlockRequestsOptions) => blockRequests(context.page, options);
    context.waitForSelector = async (selector: string, timeoutMs = 5_000) => {
        const locator = context.page.locator(selector).first();
        await locator.waitFor({ timeout: timeoutMs, state: 'attached' });
    };
    context.parseWithCheerio = async (selector?: string, timeoutMs = 5_000) => {
        if (selector) {
            await context.waitForSelector(selector, timeoutMs);
        }

        return parseWithCheerio(context.page, crawlerOptions.ignoreShadowRoots, crawlerOptions.ignoreIframes);
    };
    context.infiniteScroll = async (options?: InfiniteScrollOptions) => infiniteScroll(context.page, options);
    context.saveSnapshot = async (options?: SaveSnapshotOptions) =>
        saveSnapshot(context.page, { ...options, config: context.crawler.config });
    context.enqueueLinksByClickingElements = async (
        options: Omit<EnqueueLinksByClickingElementsOptions, 'page' | 'requestQueue'>,
    ) =>
        enqueueLinksByClickingElements({
            ...options,
            page: context.page,
            requestQueue: context.crawler.requestQueue!,
        });
    context.compileScript = (scriptString: string, ctx?: Dictionary) => compileScript(scriptString, ctx);
    context.closeCookieModals = async () => closeCookieModals(context.page);
    context.handleCloudflareChallenge = async (options?: HandleCloudflareChallengeOptions) => {
        return handleCloudflareChallenge(context.page, context.request.url, context.session, options);
    };
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
