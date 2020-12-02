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
        } = options;
        options.postNavigationHooks = [({ error, session }) => {
            // It would be better to compare the instances,
            // but we don't have access to puppeteer.errors here.
            if (error && error.constructor.name === 'TimeoutError') {
                handleRequestTimeout(session, error.message);
            }
        }];
        super(options);

        this.launchPuppeteerOptions = launchPuppeteerOptions;
        this.puppeteerModule = puppeteerModule;
    }

    createBrowserPool() {
        let createProxyUrlFunction;

        if (this.proxyConfiguration) {
            createProxyUrlFunction = this._createProxyUrlFunction.bind(this);
        }

        const puppeteerPlugin = new PuppeteerPlugin(
            // eslint-disable-next-line
            this.puppeteerModule,
            {
                launchOptions: this.launchPuppeteerOptions,
                createProxyUrlFunction: createProxyUrlFunction && createProxyUrlFunction.bind(this),
            },
        );
        this.browserPlugins = [puppeteerPlugin];

        return super.createBrowserPool();
    }
}

export default PuppeteerCrawler;
