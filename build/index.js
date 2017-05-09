'use strict';

var _utils = require('./utils');

var _actor = require('./actor');

var _keyValueStore = require('./key-value-store');

var _keyValueStore2 = _interopRequireDefault(_keyValueStore);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Apifier = {
    main: _actor.main,
    heyIAmReady: _actor.heyIAmReady,
    setPromisesDependency: _utils.setPromisesDependency,
    getPromisesDependency: _utils.getPromisesDependency,
    openKeyValueStore: _keyValueStore2.default
};

// export this way so that we can import using:
// const Apifier = require('apifier');
module.exports = Apifier;