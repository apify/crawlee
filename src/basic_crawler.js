import { checkParamOrThrow } from 'apify-client/build/utils';
import _ from 'underscore';
import AutoscaledPool from './autoscaled_pool';

const DEFAULT_OPTIONS = {
    maxRequestRetries: 3,
};

export default class BasicCrawler {
    constructor(opts) {
        const {
            requestList,
            handleRequestFunction,
            maxRequestRetries,

            // Autoscaled pool options
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(requestList, 'opts.requestList', 'Object'); // @TODO make this optional when we have request queue
        checkParamOrThrow(handleRequestFunction, 'opts.handleRequestFunction', 'Function');
        checkParamOrThrow(maxRequestRetries, 'opts.maxRequestRetries', 'Number');

        // @TODO: for clarity, I'd make this an instance function rather than embedded function
        const workerFunction = () => {
            const request = requestList.fetchNextRequest();

            if (!request) return;

            const promise = handleRequestFunction({ request });
            if (!promise || typeof promise.then !== 'function' || typeof promise.catch !== 'function') {
                throw new Error('User provided handleRequestFunction must return a Promise.');
            }

            return promise.catch((err) => {
                request.errorInfo.push(err);

                if (request.retryCount < maxRequestRetries) {
                    request.retryCount++;
                    requestList.reclaimRequest(request);
                } else {
                    requestList.markRequestHandled(request);
                }
            });
        };

        this.autoscaledPool = new AutoscaledPool({
            workerFunction,
            maxMemoryMbytes,
            maxConcurrency,
            minConcurrency,
        });
    }

    run() {
        return this.autoscaledPool.run();
    }
}
