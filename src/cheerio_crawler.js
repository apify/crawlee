import rp from 'request-promise';
import _ from 'underscore';
import cheerio from 'cheerio';
import { checkParamOrThrow } from 'apify-client/build/utils';
import BasicCrawler from './basic_crawler';
import { isPromise } from './utils';

const DEFAULT_OPTIONS = {
    requestFunction: ({ request }) => rp({ url: request.url, method: request.method, headers: request.headers }),
    pageOpsTimeoutMillis: 300000,
    requestOptions: {
        ignoreSslErrors: true,
    },
};

export default class CheerioCrawler {
    constructor(opts) {
        const {
            requestFunction,
            handlePageFunction,
            pageOpsTimeoutMillis,
            requestOptions,

            // Autoscaled pool options
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
            minFreeMemoryRatio,
            isFinishedFunction,

            // Basic crawler options
            requestList,
            requestQueue,
            maxRequestRetries,
            maxRequestsPerCrawl,
            handleFailedRequestFunction,
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(requestFunction, 'opts.requestFunction', 'Function');
        checkParamOrThrow(handlePageFunction, 'opts.handlePageFunction', 'Function');
        checkParamOrThrow(handleFailedRequestFunction, 'opts.handleFailedRequestFunction', 'Maybe Function');
        checkParamOrThrow(requestOptions, 'opts.requestOptions', 'Object');

        if (requestOptions.ignoreSslErrors) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        this.handlePageFunction = handlePageFunction;
        this.requestFunction = requestFunction;
        this.pageOpsTimeoutMillis = pageOpsTimeoutMillis;

        this.basicCrawler = new BasicCrawler({
            // Basic crawler options.
            requestList,
            requestQueue,
            maxRequestRetries,
            maxRequestsPerCrawl,
            handleRequestFunction: (...args) => this._handleRequestFunction(...args),
            handleFailedRequestFunction,

            // Autoscaled pool options.
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
            minFreeMemoryRatio,
            isFinishedFunction,
            ignoreMainProcess: true,
        });
    }

    /**
     * Runs the crawler. Returns promise that gets resolved once all the requests got processed.
     *
     * @return {Promise}
     */
    run() {
        return this.basicCrawler.run();
    }

    /**
     * Wrapper around handlePageFunction that opens and closes pages etc.
     *
     * @ignore
     */
    _handleRequestFunction({ request }) {
        const handlePagePromise = this.requestFunction({ request })
            .then((html) => {
                const $ = cheerio.load(html);
                const promise = this.handlePageFunction({ $, html, request });
                if (!isPromise(promise)) throw new Error('User provided handlePageFunction must return a Promise.');
                return promise;
            });

        return handlePagePromise
            .timeout(this.pageOpsTimeoutMillis, 'CheerioCrawler: handlePageFunction timed out.');
    }
}
