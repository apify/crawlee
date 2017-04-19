'use strict';

var _underscore = require('underscore');

var _underscore2 = _interopRequireDefault(_underscore);

var _actor = require('./actor');

var _actor2 = _interopRequireDefault(_actor);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Apifier = {};
_underscore2.default.extend(Apifier, _actor2.default);

// export this way so the we can import as:
// const Apifier = require('apifier');
module.exports = Apifier;