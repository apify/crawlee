'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

exports.default = {

    main: function main(handler) {
        if (!handler || typeof handler !== 'function') {
            throw new Error('Handler function must be provided as a parameter');
        }
        var serverPort = parseInt(process.env.APIFIER_INTERNAL_PORT, 10);
        if (!(serverPort > 0 && serverPort < 65536)) {
            throw new Error('APIFIER_INTERNAL_PORT environment variable must be a value from 1 to 65535.');
        }

        var watchFileName = process.env.APIFIER_WATCH_FILE;

        var wrappedHandler = function wrappedHandler(req, res) {
            try {
                handler(req, res);

                // close response if not yet
            } catch (e) {
                console.log('Received message!!!');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/plain');
                res.end('Hello World\n');
            }
        };

        var server = _http2.default.createServer(wrappedHandler);

        server.listen(serverPort, function () {
            console.log('Listening on port ' + serverPort);
            if (watchFileName) _fs2.default.writeFileSync(watchFileName, '');
        });
    }

};