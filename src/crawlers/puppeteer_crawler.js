import { PuppeteerPlugin } from 'browser-pool';
import BrowserCrawler from './browser_crawler';
import { handleRequestTimeout } from './crawler_utils';

class PuppeteerCrawler extends BrowserCrawler {
    constructor(options = {}) {
        // @TODO transform options;
        // @TODO: Should we preserve the options or can we use the PuppeteerCrawler BrowserPool once?
        // @TODO: Can we throw away the launchFunction?

        const {
            puppeteerModule = require('puppeteer'), // eslint-disable-line
            launchPuppeteerOptions = {},
            browserPoolOptions = {},
            ...rest
        } = options;
        const browserCrawlerOptions = {
            browserPoolOptions,
            ...rest,
        };
        browserCrawlerOptions.postNavigationHooks = [({ error, session }) => {
            // It would be better to compare the instances,
            // but we don't have access to puppeteer.errors here.
            if (error && error.constructor.name === 'TimeoutError') {
                handleRequestTimeout(session, error.message);
            }
        }];
        browserCrawlerOptions.browserPoolOptions.browserPlugins = [
            new PuppeteerPlugin(
                // eslint-disable-next-line
                puppeteerModule,
                {
                    launchOptions: launchPuppeteerOptions,
                },
            ),
        ];
        super(browserCrawlerOptions);

        this.launchPuppeteerOptions = launchPuppeteerOptions;
        this.puppeteerModule = puppeteerModule;
    }
}

export default PuppeteerCrawler;
