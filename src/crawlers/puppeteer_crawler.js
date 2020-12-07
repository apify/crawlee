import { PuppeteerPlugin } from 'browser-pool';
import ow from 'ow';
import BrowserCrawler from './browser_crawler';
import { handleRequestTimeout } from './crawler_utils';
import { gotoExtended } from '../puppeteer_utils';

class PuppeteerCrawler extends BrowserCrawler {
    static optionsShape = {
        ...BrowserCrawler.optionsShape,
        gotoFunction: ow.optional.function,
        browserPoolOptions: ow.optional.object,
        gotoTimeoutSecs: ow.optional.number,
        launchPuppeteerOptions: ow.optional.object,
    }

    constructor(options = {}) {
        ow(options, 'PuppeteerCrawlerOptions', ow.object.exactShape(PuppeteerCrawler.optionsShape));

        const {
            puppeteerModule = require('puppeteer'), // eslint-disable-line
            launchPuppeteerOptions = {},
            browserPoolOptions = {},
            ...browserCrawlerOptions
        } = options;

        browserCrawlerOptions.postNavigationHooks = [({ error, session }) => {
            // It would be better to compare the instances,
            // but we don't have access to puppeteer.errors here.
            if (error && error.constructor.name === 'TimeoutError') {
                handleRequestTimeout(session, error.message);
            }
        }];

        browserPoolOptions.browserPlugins = [
            new PuppeteerPlugin(
                // eslint-disable-next-line
                puppeteerModule,
                {
                    launchOptions: launchPuppeteerOptions,
                },
            ),
        ];
        super({
            ...browserCrawlerOptions,
            browserPoolOptions,
        });

        this.launchPuppeteerOptions = launchPuppeteerOptions;
        this.puppeteerModule = puppeteerModule;
    }

    async _navigationHandler(crawlingContext) {
        if (this.gotoFunction) return this.gotoFunction(crawlingContext);
        return gotoExtended(crawlingContext.page, crawlingContext.request, { timeout: this.gotoTimeoutMillis });
    }
}

export default PuppeteerCrawler;
