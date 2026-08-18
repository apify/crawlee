import { BrowserPool, RemoteBrowserPool } from '@crawlee/browser-pool';
import { BrowserCrawler } from '@crawlee/puppeteer';
export class BrowserCrawlerTest extends BrowserCrawler {
    constructor(options = {}) {
        const { browserPoolOptions, ...browserCrawlerOptions } = options;
        super({
            ...browserCrawlerOptions,
            browserPoolBuilder: (remoteBrowser) => remoteBrowser
                ? new RemoteBrowserPool({
                    ...remoteBrowser,
                    browserPlugins: browserPoolOptions.browserPlugins,
                })
                : new BrowserPool(browserPoolOptions),
            contextPipelineBuilder: () => this.buildContextPipeline(),
        });
    }
    async navigationHandler(ctx, gotoOptions) {
        return ctx.page.goto(ctx.request.url, gotoOptions);
    }
}
