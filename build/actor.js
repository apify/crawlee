'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.heyIAmReady = exports.main = undefined;

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _utils = require('./utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* global process */

var main = exports.main = function main(userFunc) {
    if (!userFunc || typeof userFunc !== 'function') {
        throw new Error('Handler function must be provided as a parameter');
    }
    var serverPort = parseInt(process.env.APIFIER_INTERNAL_PORT, 10);
    if (!(serverPort > 0 && serverPort < 65536)) {
        throw new Error('APIFIER_INTERNAL_PORT environment variable must have a value from 1 to 65535.');
    }

    var handler = function handler(req, res) {
        var options = {
            input: {
                body: req.body,
                method: req.method,
                contentType: req.headers['content-type']
            }
        };

        (0, _utils.newPromise)().then(function () {
            return userFunc(options);
        }).then(function () {
            res.statusCode = 200;
        }).catch(function (err) {
            console.log('User act failed: ' + err);
            res.statusCode = 500;
        }).then(function () {
            res.end(function (err) {
                if (err) {
                    console.log('Failed to send HTTP response: ' + err);
                    process.exit(1);
                }
                console.log('All good, finishing the act');
                process.exit(0);
            });
        }).catch(function (err) {
            console.log('Something went terribly wrong: ' + err);
            process.exit(2);
        });
    };

    var app = (0, _express2.default)();

    // parse JSON, pass texts and raw data
    app.use(_bodyParser2.default.json());
    app.use(_bodyParser2.default.text({ type: 'text/*' }));
    app.use(_bodyParser2.default.raw({ type: '*/*' }));
    app.use(handler);

    // TODO: handle errors!
    app.listen(serverPort, function () {
        // console.log(`Listening on port ${serverPort}`);
        heyIAmReady();
    });
};

/**
 * Notifies Apifier runtime that act is listening on port specified by the APIFIER_INTERNAL_PORT environment
 * variable and is ready to receive a HTTP request with act input.
 */
var heyIAmReady = exports.heyIAmReady = function heyIAmReady() {
    var watchFileName = process.env.APIFIER_WATCH_FILE;
    if (watchFileName) {
        _fs2.default.writeFile(watchFileName, '', function (err) {
            if (err) console.log('WARNING: Cannot write to watch file ' + watchFileName + ': ' + err);
        });
    }
};