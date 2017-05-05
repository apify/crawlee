'use strict';

var _utils = require('./utils');

var _actor = require('./actor');

var Apifier = {
    main: _actor.main,
    heyIAmReady: _actor.heyIAmReady,
    setPromisesDependency: _utils.setPromisesDependency,
    getPromisesDependency: _utils.getPromisesDependency
};

// export this way so that we can import using:
// const Apifier = require('apifier');
module.exports = Apifier;