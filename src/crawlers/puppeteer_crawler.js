import { PuppeteerPlugin } from 'browser-pool';
import BrowserCrawler from './browser_crawler';

class PuppeteerCrawler extends BrowserCrawler {
    constructor(options = {}) {
        // @TODO transform options;
        // @TODO: Should we preserve the options or can we use the PuppeteerCrawler BrowserPool once?
        // @TODO: Can we throw away the launchFunction?

        const {
            puppeteerModule = require('puppeteer'), // eslint-disable-line
            launchPuppeteerOptions = {},
        } = options;
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
