import _ from 'underscore';
import { log } from 'apify-shared/log';
import { launchPuppeteer } from './puppeteer';

const BROWSER_KILLER_INTERVAL_MILLIS = 60 * 1000;
const KILL_BROWSER_AFTER_MILLIS = 5 * 60 * 1000;

const PUPPETEER_CONFIG = {
    dumpio: process.env.NODE_ENV !== 'production',
    slowMo: 0,
    args: [],
};

// @TODO remove awaits

class Browser {
    constructor(id, browserPromise) {
        this.id = id;
        this.crawledPages = 0;
        this.browserPromise = browserPromise;
        this.lastNewPage = Date.now();
        this.retired = true;
    }
}

const getPuppeteerConfig = ({ userAgent, dumpio, disableWebSecurity, proxyUrl }) => {
    const config = Object.assign({}, PUPPETEER_CONFIG);

    if (userAgent) config.userAgent = userAgent;
    if (dumpio !== undefined) config.dumpio = dumpio;
    if (proxyUrl) config.proxyUrl = proxyUrl;
    if (disableWebSecurity) {
        config.ignoreHTTPSErrors = true;
        config.args.push('--disable-web-security');
    }

    return config;
};

export default class PuppeteerPool {
    constructor(crawlerConfig) {
        this.browserCounter = 0;
        this.puppeteerConfig = getPuppeteerConfig(crawlerConfig);
        this.maxCrawledPagesPerSlave = crawlerConfig.maxCrawledPagesPerSlave;
        this.currentBrowser = this._createBrowser();
        this.retiredBrowsers = {};
        this.browserKillerInterval = setInterval(() => this._killRetiredBrowsers(), BROWSER_KILLER_INTERVAL_MILLIS);
    }

    _createBrowser() {
        const puppeteerPromise = launchPuppeteer(this.puppeteerConfig);
        const browser = new Browser(this.browserCounter++, puppeteerPromise);

        browser.browserPromise.then((puppeteerBrowser) => {
            puppeteerBrowser.on('disconnected', () => {
                log.error('PuppeteerPool: Puppeteer sent "disconnect" event. Crashed???');

                if (!browser.retired) this._retireCurrentBrowser();
            });
        });

        return browser;
    }

    _retireCurrentBrowser() {
        log.info('PuppeteerPool: retiring browser');

        const { currentBrowser } = this;

        currentBrowser.retired = true;
        this.retiredBrowsers[currentBrowser.id] = currentBrowser;
        this.currentBrowser = this._createBrowser();
    }

    _killBrowser(browser) {
        log.info('PuppeteerPool: killing browser', { browserId: browser.id });

        delete this.retiredBrowsers[browser.id];

        browser
            .browserPromise
            .then(puppeteerBrowser => puppeteerBrowser.close())
            .catch(err => log.exception(err, 'PuppeteerPool: cannot close the browser instance'));
    }

    async _killRetiredBrowsers() {
        log.info('PuppeteerPool: retired browsers count', { count: _.values(this.retiredBrowsers).length });

        _.mapObject(this.retiredBrowsers, (browser) => {
            if (Date.now() - browser.lastNewPage > KILL_BROWSER_AFTER_MILLIS) return this._killBrowser(browser);

            browser
                .browserPromise
                .then(puppeteerBrowser => puppeteerBrowser.pages())
                .catch(() => this._killBrowser(browser))
                .then((pages) => {
                    if (pages.length === 0) return this._killBrowser(browser);
                });
        });
    }

    async newPage() {
        const browser = this.currentBrowser;

        browser.lastNewPage = Date.now();
        browser.crawledPages++;

        if (browser.crawledPages > this.maxCrawledPagesPerSlave) this._retireCurrentBrowser();

        const puppeteerBrowser = await browser.browserPromise;

        return puppeteerBrowser.newPage();
    }

    /**
     * Kills all the resources - opened browsers and intervals.
     */
    async destroy() {
        clearInterval(this.browserKillerInterval);

        const browserPromises = _
            .values(this.retiredBrowsers)
            .concat(this.currentBrowser)
            .map(browser => browser.browserPromise);

        const closePromises = browserPromises.map((browserPromise) => {
            return browserPromise.then(puppeteer => puppeteer.close());
        });

        return Promise
            .all(closePromises)
            .catch(err => log.exception(err, 'PuppeteerPool: cannot close the browsers'));
    }
}
