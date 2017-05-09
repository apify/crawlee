import _ from 'underscore';
import { requestPromise, objectToQueryString, arrays2object } from './utils';

const methods = {
    getStore: (baseUrl, storeId) => requestPromise({
        url: `${baseUrl}/${storeId}`,
        json: true,
        method: 'GET',
    }),

    drop: (baseUrl, storeId) => requestPromise({
        url: `${baseUrl}/${storeId}`,
        json: true,
        method: 'DELETE',
    }),

    get: (baseUrl, storeId, recordKey) => requestPromise({
        url: `${baseUrl}/${storeId}/records/${recordKey}`,
        json: true,
        method: 'GET',
    }),

    put: (baseUrl, storeId, recordKey, body, contentType) => requestPromise({
        url: `${baseUrl}/${storeId}/records/${recordKey}`,
        json: true,
        method: 'PUT',
        body,
        headers: {
            'Content-Type': contentType,
        },
    }),

    delete: (baseUrl, storeId, recordKey) => requestPromise({
        url: `${baseUrl}/${storeId}/records/${recordKey}`,
        json: true,
        method: 'DELETE',
    }),

    keys: (baseUrl, storeId, exclusiveStartKey, count) => requestPromise({
        url: `${baseUrl}/${storeId}/records${objectToQueryString({ exclusiveStartKey, count })}`,
        json: true,
        method: 'GET',
    }),

    map: (baseUrl, storeId, exclusiveStartKey, count, callback) => {
        return methods
            .toArray(baseUrl, storeId, exclusiveStartKey, count)
            .then(values => values.map(callback));
    },

    mapObject: (baseUrl, storeId, exclusiveStartKey, count, callback) => {
        return methods
            .toObject(baseUrl, storeId, exclusiveStartKey, count)
            .then(obj => _.mapObject(obj, callback));
    },

    mapKeys: (baseUrl, storeId, exclusiveStartKey, count, callback) => {
        return methods
            .keys(baseUrl, storeId, exclusiveStartKey, count)
            .then(keys => keys.map(callback));
    },

    forEach: (baseUrl, storeId, exclusiveStartKey, count, callback) => {
        return methods
            .toObject(baseUrl, storeId, exclusiveStartKey, count)
            .then((values) => {
                _.forEach(values, callback);
            });
    },

    forEachKey: (baseUrl, storeId, exclusiveStartKey, count, callback) => {
        return methods
            .keys(baseUrl, storeId, exclusiveStartKey, count)
            .then(keys => keys.forEach(callback));
    },

    toObject: (baseUrl, storeId, exclusiveStartKey, count) => {
        return methods
            .keys(baseUrl, storeId, exclusiveStartKey, count)
            .then((keys) => {
                const getPromises = keys.map(key => methods.get(baseUrl, storeId, key));

                return Promise
                    .all(getPromises)
                    .then(values => arrays2object(keys, values));
            });
    },

    toArray: (baseUrl, storeId, exclusiveStartKey, count) => {
        return methods
            .keys(baseUrl, storeId, exclusiveStartKey, count)
            .then((keys) => {
                const getPromises = keys.map(key => methods.get(baseUrl, storeId, key));

                return Promise.all(getPromises);
            });
    },

    reduce: (baseUrl, storeId, exclusiveStartKey, count, callback, initial) => {
        return methods
            .keys(baseUrl, storeId, exclusiveStartKey, count)
            .then((keys) => {
                const getPromises = keys.map(key => methods.get(baseUrl, storeId, key));

                const reducer = (carry, currentVal, currentIndex) => {
                    return callback(carry, currentVal, keys[currentIndex]);
                };

                return Promise
                    .all(getPromises)
                    .then(values => values.reduce(reducer, initial));
            });
    },
};

/**
 * Get or creates key value store and returns it's object.
 * There are 3 possible initializations:
 *
 * 1) If `options.storeId` is provided then store with this id gets opened.
 * 2) If `options.name`, `options.token` and one of `options.ownerUserId` and `options.ownerUser`
 *    are provided then store with given name gets opened or created if not exists.
 * 3) If ENV.APIFY_ACT_RUN_ID exists then store with this id (ie. store belonging to this act run)
 *    gets opened.
 */
const createOrGetStore = (baseUrl, options) => {
    if (options.storeId) return methods.getStore(baseUrl, options.storeId);

    if ((options.ownerUserId || options.ownerUser) && options.token && options.name) {
        return requestPromise({
            url: baseUrl,
            json: true,
            method: 'POST',
            body: _.pick(options, 'ownerUserId', 'ownerUser', 'token', 'name'),
        });
    }

    if (process.env.APIFY_ACT_RUN_ID) return methods.getStore(baseUrl, process.env.APIFY_ACT_RUN_ID);

    throw new Error('Error: cannot identify store via storeId, credentials or ENV variable.');
};

/**
 * Opens key value store and returns object containing preconfigured methods for that store.
 * Possible options are:
 * - protocol (http/https)
 * - host
 * - port
 * - basePath
 * - storeId
 * - ownerUser
 * - ownerUserId
 * - token
 * - name
 */
export default (options = {}) => {
    if (!_.isObject(options)) throw new Error('Error: `options` must be object or empty.');

    // eslint-disable-next-line prefer-template
    const baseUrl = (options.protocol || 'https')
                  + '://'
                  + (options.host || 'api.apifier.com')
                  + (options.port ? `:${options.port}` : '')
                  + (options.basePath || '/v2/key-value-stores');

    return createOrGetStore(baseUrl, options)
        .then(store => _.mapObject(methods, method => _.partial(method, baseUrl, store._id)));
};
