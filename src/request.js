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

