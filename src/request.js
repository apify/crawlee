import { checkParamOrThrow } from 'apify-client/build/utils';
import { normalizeUrl } from 'apify-shared/utilities';
import _ from 'underscore';

export const computeUniqueKey = (url, keepUrlFragment) => normalizeUrl(url, keepUrlFragment);

/**
 * Requests class defines a web request to be processed and stores info about error that occurred during the processing.
 *
 * Example use:
 *
 * ```javascript
 * const request = new Apify.Request({
 *     url: 'http://example.com',
 *     headers: { Accept: 'application/json' },
 * });
 *
 * ...
 *
 * request.userData.foo = 'bar';
 * request.pushErrorMessage(new Error('Request failed!'));
 *
 * ...
 *
 * const foo = request.userData.foo;
 * ```
 *
 * @param {object} opts
 * @param {String} opts.url
 * @param {String} [opts.uniqueKey] Unique key identifying request. In not provided then it is computed as normalized URL.
 * @param {String} [opts.method='GET']
 * @param {String|Buffer} [opts.payload] Request payload. If method='GET' then the payload is not allowed.
 * @param {Number} [opts.retryCount=0] How many times the url was retried in a case of exception.
 * @param {String} [opts.errorMessages] Array of error messages from request processing.
 * @param {String} [opts.headers={}] HTTP headers.
 * @param {Object} [opts.userData={}] Custom data that user can assign to request.
 * @param {Boolean} [opts.keepUrlFragment=false] If false then hash part is removed from url when computing `uniqueKey`.
 */
export default class Request {
    constructor({
        id,
        url,
        uniqueKey,
        method = 'GET',
        payload = null,
        retryCount = 0,
        errorMessages = null,
        headers = {},
        userData = {},
        keepUrlFragment = false,
    }) {
        checkParamOrThrow(id, 'id', 'Maybe String');
        checkParamOrThrow(url, 'url', 'String');
        checkParamOrThrow(uniqueKey, 'uniqueKey', 'Maybe String');
        checkParamOrThrow(method, 'method', 'String');
        checkParamOrThrow(payload, 'payload', 'Maybe Buffer | String');
        checkParamOrThrow(retryCount, 'retryCount', 'Number');
        checkParamOrThrow(errorMessages, 'errorMessages', 'Maybe Array');
        checkParamOrThrow(headers, 'headers', 'Object');
        checkParamOrThrow(userData, 'userData', 'Object');

        if (method === 'GET' && payload) throw new Error('Request with GET method cannot have a payload.');

        this.id = id;
        this.url = url;
        this.uniqueKey = uniqueKey || computeUniqueKey(url, keepUrlFragment);
        this.method = method;
        this.payload = payload;
        this.retryCount = retryCount;
        this.errorMessages = errorMessages;
        this.headers = headers;
        this.userData = userData;
    }

    /**
     * Stores information about processing error of this request.
     *
     * @param {Error|String} errorOrMessage Error object or error message to be stored in request.
     */
    pushErrorMessage(errorOrMessage) {
        if (!_.isString(errorOrMessage) && !(errorOrMessage instanceof Error)) {
            throw new Error('Parameter errorOrMessage must be a String or an instance of Error');
        }

        const message = errorOrMessage instanceof Error
            ? errorOrMessage.message
            : errorOrMessage;

        if (!this.errorMessages) this.errorMessages = [];

        this.errorMessages.push(message);
    }
}

