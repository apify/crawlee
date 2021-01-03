import { PlaywrightPlugin } from 'browser-pool';
import ow from 'ow';
import BrowserCrawler from './browser_crawler';
import { handleRequestTimeout } from './crawler_utils';
import { gotoExtended } from '../puppeteer_utils';

class PlaywrightCrawler extends BrowserCrawler {
    static optionsShape = {
        ...BrowserCrawler.optionsShape,
        browserPoolOptions: ow.optional.object,
        gotoTimeoutSecs: ow.optional.number,
        launchPuppeteerOptions: ow.optional.object,
    }

    constructor(options = {}) {
        ow(options, 'PlaywrightCrawlerOptions', ow.object.exactShape(PlaywrightCrawler.optionsShape));

        const {
            playwrightModule = require('playwright').chromium, // eslint-disable-line
            launchPlaywrightOptions = {},
            gotoTimeoutSecs,
            browserPoolOptions = {},
            ...browserCrawlerOptions
        } = options;

        browserCrawlerOptions.postNavigationHooks = [({ error, session }) => {
            // It would be better to compare the instances,
            if (error && error.constructor.name === 'TimeoutError') {
                handleRequestTimeout(session, error.message);
            }
        }];

        browserPoolOptions.browserPlugins = [
            new PlaywrightPlugin(
                // eslint-disable-next-line
                playwrightModule,
                {
                    launchOptions: launchPlaywrightOptions,
                },
            ),
        ];

        super({
            ...browserCrawlerOptions,
            browserPoolOptions,
        });

        this.gotoTimeoutMillis = gotoTimeoutSecs * 1000;

        this.launchPlaywrightOptions = launchPlaywrightOptions;
        this.playwrightModule = playwrightModule;
    }

    async _navigationHandler(crawlingContext) {
        if (this.gotoFunction) return this.gotoFunction(crawlingContext);
        return gotoExtended(crawlingContext.page, crawlingContext.request, { timeout: this.gotoTimeoutMillis });
    }
}

export default PlaywrightCrawler;
