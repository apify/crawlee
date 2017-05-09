'use strict';

var _underscore = require('underscore');

var _underscore2 = _interopRequireDefault(_underscore);

var _utils = require('./utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var methods = {
    getStore: function getStore(baseUrl, storeId) {
        return (0, _utils.requestPromise)({
            url: baseUrl + '/' + storeId,
            json: true,
            method: 'GET'
        });
    },

    deleteStore: function deleteStore(baseUrl, storeId) {
        return (0, _utils.requestPromise)({
            url: baseUrl + '/' + storeId,
            json: true,
            method: 'DELETE'
        });
    },

    getRecordsList: function getRecordsList(baseUrl, storeId) {
        return (0, _utils.requestPromise)({
            url: baseUrl + '/' + storeId + '/records',
            json: true,
            method: 'GET'
        });
    },

    getRecord: function getRecord(baseUrl, storeId, recordKey) {
        return (0, _utils.requestPromise)({
            url: baseUrl + '/' + storeId + '/records/' + recordKey,
            json: true,
            method: 'GET'
        });
    },

    putRecord: function putRecord(baseUrl, storeId, recordKey, body, contentType) {
        return (0, _utils.requestPromise)({
            url: baseUrl + '/' + storeId + '/records/' + recordKey,
            json: true,
            method: 'PUT',
            body: body,
            headers: {
                'Content-Type': contentType
            }
        });
    },

    deleteRecord: function deleteRecord(baseUrl, storeId, recordKey) {
        return (0, _utils.requestPromise)({
            url: baseUrl + '/' + storeId + '/records/' + recordKey,
            json: true,
            method: 'DELETE'
        });
    }
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
var createOrGetStore = function createOrGetStore(baseUrl, options) {
    if (options.storeId) return methods.getStore(baseUrl, options.storeId);

    if ((options.ownerUserId || options.ownerUser) && options.token && options.name) {
        return (0, _utils.requestPromise)({
            url: baseUrl,
            json: true,
            method: 'POST',
            body: _underscore2.default.pick(options, 'ownerUserId', 'ownerUser', 'token', 'name')
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
// export default
var openKeyValueStore = function openKeyValueStore() {
    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    if (!_underscore2.default.isObject(options)) throw new Error('Error: `options` must be object or empty.');

    // eslint-disable-next-line prefer-template
    var baseUrl = (options.protocol || 'https') + '://' + (options.host || 'api.apifier.com') + (options.port ? ':' + options.port : '') + (options.basePath || '/v2/key-value-stores');

    return createOrGetStore(baseUrl, options).then(function (store) {
        return _underscore2.default.mapObject(methods, function (method) {
            return _underscore2.default.partial(method, baseUrl, store._id);
        });
    });
};

var options = {
    protocol: 'http',
    host: 'localhost',
    port: '3300',
    basePath: '/api/v2/key-value-stores',
    storeId: '9mNnMEBm3LCakrgw3'
};

var options2 = {
    protocol: 'http',
    host: 'localhost',
    port: '3300',
    basePath: '/api/v2/key-value-stores',
    ownerUser: 'mtrunkat',
    token: '4AqtcLL4aQCtcWj9BSoLLACwJ',
    name: 'new-store'
};

openKeyValueStore(options2).then(function (store) {
    return store.getStore().then(function (out) {
        return console.log(out);
    }).then(function () {
        return store.putRecord('xxx', '{ "a": 2 }', 'application/json; charset=utf-8');
    }).then(function () {
        return store.getRecord('xxx');
    }).then(function (out) {
        return console.log(out);
    });
});