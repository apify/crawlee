import { checkParamOrThrow } from 'apify-client/build/utils';
import { normalizeUrl } from 'apify-shared/utilities';

export const computeUniqueKey = (url, keepUrlFragment) => normalizeUrl(url, keepUrlFragment);

export default class Request {
    constructor({
        url,
        uniqueKey,
        method = 'GET',
        payload,
        retryCount = 0,
        // @TODO: I think having empty array as default is not ideal, because if(errorInfo) is true.
        // perhaps we can call this 'errors', have it null by default and only make it an array once first used?
        // For example we can add function pushError(). Also, we shouldn't serialize Error object,
        // so maybe call it errorMessages and pushErrorMessage() ?
        errorInfo = [],
        headers = {},
        userData = {},
        keepUrlFragment = false,
    }) {
        checkParamOrThrow(url, 'url', 'String');
        checkParamOrThrow(uniqueKey, 'uniqueKey', 'Maybe String');
        checkParamOrThrow(method, 'method', 'String');
        checkParamOrThrow(payload, 'payload', 'Maybe Buffer | String');
        checkParamOrThrow(retryCount, 'retryCount', 'Number');
        checkParamOrThrow(errorInfo, 'errorInfo', 'Array');
        checkParamOrThrow(headers, 'headers', 'Object');
        checkParamOrThrow(userData, 'userData', 'Object');

        this.url = url;
        this.uniqueKey = uniqueKey || computeUniqueKey(url, keepUrlFragment);
        this.method = method;
        this.payload = payload;
        this.retryCount = retryCount;
        this.errorInfo = errorInfo;
        this.headers = headers;
        this.userData = userData;
    }
}

