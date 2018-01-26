import { checkParamOrThrow } from 'apify-client/build/utils';
import { normalizeUrl } from 'apify-shared/utilities';

export const computeUniqueKey = (url, keepUrlFragment) => normalizeUrl(url, keepUrlFragment);

export default class Request {
    constructor({
        url,
        uniqueKey,
        method = 'GET',
        payload,
        headers = {},
        userData = {},
        keepUrlFragment = false,
    }) {
        checkParamOrThrow(url, 'url', 'String');
        checkParamOrThrow(uniqueKey, 'uniqueKey', 'Maybe String');
        checkParamOrThrow(method, 'method', 'String');
        checkParamOrThrow(payload, 'payload', 'Maybe Buffer | String');
        checkParamOrThrow(headers, 'headers', 'Maybe Object');
        checkParamOrThrow(userData, 'userData', '*');

        this.url = url;
        this.uniqueKey = uniqueKey || computeUniqueKey(url, keepUrlFragment);
        this.method = method;
        this.payload = payload;
        this.headers = headers;
        this.userData = userData;
    }
}

