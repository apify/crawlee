'use strict';

var _utils = require('./utils');

var _actor = require('./actor');

var _crawler = require('./crawler');

var Apifier = {
    main: _actor.main,
    heyIAmReady: _actor.heyIAmReady,
    setPromisesDependency: _utils.setPromisesDependency,
    getPromisesDependency: _utils.getPromisesDependency,
    setDefaultToken: _crawler.setDefaultToken,
    setDefaultUserId: _crawler.setDefaultUserId,
    getAllCrawlers: _crawler.getAllCrawlers,
    startCrawler: _crawler.startCrawler
};

// export this way so that we can import using:
// const Apifier = require('apifier');
module.exports = Apifier;