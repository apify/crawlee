import { checkParamOrThrow } from 'apify-client/build/utils';
import _ from 'underscore';
import Promise from 'bluebird';
import BasicCrawler from './basic_crawler';
import PuppeteerPool from './puppeteer_pool';

const DEFAULT_OPTIONS = {
    gotoFunction: ({ request, page }) => page.goto(request.url),
    pageOpsTimeoutMillis: 30000,
};

export default class PuppeteerCrawler {
    constructor(opts) {
        const {
            handlePageFunction,
            gotoFunction,
            pageOpsTimeoutMillis,

            // Autoscaled pool options
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,

            // Basic crawler options
            requestList,
            maxRequestRetries,

            // Puppeteer Pool options
            maxOpenPagesPerInstance,
            abortInstanceAfterRequestCount,
            launchPuppeteerFunction,
            instanceKillerIntervalMillis,
            killInstanceAfterMillis,
            proxyGroups,
            puppeteerConfig,
            disableProxy,
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(handlePageFunction, 'opts.handlePageFunction', 'Function');
        checkParamOrThrow(gotoFunction, 'opts.gotoFunction', 'Function');
        checkParamOrThrow(pageOpsTimeoutMillis, 'opts.pageOpsTimeoutMillis', 'Number');

        this.puppeteerPool = new PuppeteerPool({
            maxOpenPagesPerInstance,
            abortInstanceAfterRequestCount,
            launchPuppeteerFunction,
            instanceKillerIntervalMillis,
            killInstanceAfterMillis,
            proxyGroups,
            puppeteerConfig,
            disableProxy,
        });

        const handleRequestFunction = ({ request }) => {
            let page;

            const handlePagePromise = this.puppeteerPool
                .newPage()
                .then((newPage) => { page = newPage; })
                .then(() => gotoFunction({ page, request, puppeteerPool: this.puppeteerPool }))
                .then(() => handlePageFunction({ page, request, puppeteerPool: this.puppeteerPool }));

            const timeoutPromise = new Promise(resolve => setTimeout(resolve, pageOpsTimeoutMillis));

            return Promise
                .race([
                    handlePagePromise,
                    timeoutPromise.then(() => { throw new Error('PuppeteerCrawler: handlePageFunction timeouted'); }),
                ])
                .finally(() => {
                    if (page) return page.close();
                });
        };

        this.basicCrawler = new BasicCrawler({
            // Basic crawler options.
            requestList,
            maxRequestRetries,
            handleRequestFunction,

            // Autoscaled pool options.
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
        });
    }

    run() {
        return this.basicCrawler.run()
            .finally(() => this.puppeteerPool.destroy());
    }
}
