import { PuppeteerPlugin } from 'browser-pool';
import ow from 'ow';
import * as _ from 'underscore';

import { ENV_VARS } from 'apify-shared/consts';
import BrowserCrawler from './browser_crawler';
import { handleRequestTimeout } from './crawler_utils';
import { gotoExtended } from '../puppeteer_utils';
import { DEFAULT_USER_AGENT } from '../constants';
import { getTypicalChromeExecutablePath, isAtHome } from '../utils';

import applyStealthToBrowser, { StealthOptions } from '../stealth/stealth';
// eslint-disable-line no-unused-vars,import/named
const LAUNCH_PUPPETEER_LOG_OMIT_OPTS = [
    'proxyUrl', 'userAgent', 'puppeteerModule', 'stealthOptions',
];

const LAUNCH_PUPPETEER_DEFAULT_VIEWPORT = {
    width: 1366,
    height: 768,
};

const LAUNCH_PUPPETEER_APIFY_OPTIONS = [
    ...LAUNCH_PUPPETEER_LOG_OMIT_OPTS,
    'useChrome', 'stealth',
];
class PuppeteerCrawler extends BrowserCrawler {
    static optionsShape = {
        ...BrowserCrawler.optionsShape,
        browserPoolOptions: ow.optional.object,
        gotoTimeoutSecs: ow.optional.number,
        launchPuppeteerOptions: ow.optional.object,
    }

    constructor(options = {}) {
        ow(options, 'PuppeteerCrawlerOptions', ow.object.exactShape(PuppeteerCrawler.optionsShape));

        const {
            puppeteerModule, // eslint-disable-line
            launchPuppeteerOptions = {},
            gotoTimeoutSecs,
            browserPoolOptions = {},
            ...browserCrawlerOptions
        } = options;

        const { stealth, stealthOptions } = launchPuppeteerOptions;

        browserCrawlerOptions.postNavigationHooks = [({ error, session }) => {
            // It would be better to compare the instances,
            // but we don't have access to puppeteer.errors here.
            if (error && error.constructor.name === 'TimeoutError') {
                handleRequestTimeout(session, error.message);
            }
        }];

        browserPoolOptions.browserPlugins = [
            new PuppeteerPlugin(
                getPuppeteerOrThrow(puppeteerModule),
                {
                    launchOptions: getDefaultLaunchOptions(launchPuppeteerOptions),
                },
            ),
        ];

        browserPoolOptions.postLaunchHooks = browserPoolOptions.postLaunchHooks || [];

        if (stealth) {
            browserPoolOptions.postLaunchHooks.push(async (pageId, browserController) => {
                // @TODO: We can do this better now. It is not necessary to override the page.
                // we can modify the page in the postPageCreateHook
                await applyStealthToBrowser(browserController.browser, stealthOptions);
            });
        }

        super({
            ...browserCrawlerOptions,
            browserPoolOptions,
        });

        this.gotoTimeoutMillis = gotoTimeoutSecs * 1000;

        this.launchPuppeteerOptions = launchPuppeteerOptions;
        this.puppeteerModule = puppeteerModule;
    }

    async _navigationHandler(crawlingContext) {
        if (this.gotoFunction) return this.gotoFunction(crawlingContext);
        return gotoExtended(crawlingContext.page, crawlingContext.request, { timeout: this.gotoTimeoutMillis });
    }
}

/**
 * Requires `puppeteer` package, uses a replacement or throws meaningful error if not installed.
 *
 * @param {(string|Object)} puppeteerModule
 * @ignore
 */
function getPuppeteerOrThrow(puppeteerModule = 'puppeteer') {
    if (typeof puppeteerModule === 'object') return puppeteerModule;
    try {
        // This is an optional dependency because it is quite large, only require it when used (ie. image with Chrome)
        return require(puppeteerModule); // eslint-disable-line
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
            const msg = `Cannot find module '${puppeteerModule}'. Did you you install the '${puppeteerModule}' package?`;
            err.message = isAtHome()
                ? `${msg} The 'puppeteer' package is automatically bundled when using apify/actor-node-chrome-* Base image.`
                : msg;
        }

        throw err;
    }
}
function getDefaultLaunchOptions(options) {
    const optsCopy = { ...options };

    optsCopy.args = optsCopy.args || [];
    // Add --no-sandbox for Platform, because running Chrome in Docker
    // is a very complex problem and most likely requires sys admin privileges,
    // which is a larger security concern than --no-sandbox itself.
    // TODO Find if the arg has any impact on browser detection.
    if (isAtHome()) optsCopy.args.push('--no-sandbox');

    if (optsCopy.headless == null) {
        optsCopy.headless = process.env[ENV_VARS.HEADLESS] === '1' && process.env[ENV_VARS.XVFB] !== '1';
    }
    if (optsCopy.useChrome && (optsCopy.executablePath === undefined || optsCopy.executablePath === null)) {
        optsCopy.executablePath = process.env[ENV_VARS.CHROME_EXECUTABLE_PATH] || getTypicalChromeExecutablePath();
    }

    if (optsCopy.defaultViewport === undefined) {
        optsCopy.defaultViewport = LAUNCH_PUPPETEER_DEFAULT_VIEWPORT;
    }

    // When User-Agent is not set and we're using Chromium or headless mode,
    // it is better to use DEFAULT_USER_AGENT to reduce chance of detection
    let { userAgent } = optsCopy;
    if (!userAgent && (!optsCopy.executablePath || optsCopy.headless)) {
        userAgent = DEFAULT_USER_AGENT;
    }
    if (userAgent) {
        optsCopy.args.push(`--user-agent=${userAgent}`);
    }

    return _.omit(optsCopy, LAUNCH_PUPPETEER_APIFY_OPTIONS);
}

export default PuppeteerCrawler;
