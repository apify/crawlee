import _ from 'underscore';
import { expect, assert } from 'chai';
import proxy from 'proxy';
import http from 'http';
import portastic from 'portastic';
import basicAuthParser from 'basic-auth-parser';
import Promise from 'bluebird';
import request from 'request';

import { parseUrl } from '../build/utils';
import { ProxyChainManager, PROXY_CHAIN } from '../build/proxy_chain_manager';

/* globals process */

const ORIG_PROXY_CHAIN = _.clone(PROXY_CHAIN);

let proxyServer;
let proxyPort; // eslint-disable-line no-unused-vars
const proxyAuth = { scheme: 'Basic', username: 'username', password: 'password' };
let wasProxyCalled = false; // eslint-disable-line no-unused-vars

// Setup local proxy server for the tests
before(() => {
    // Find free port for the proxy
    return portastic.find({ min: 50000, max: 50100 }).then((ports) => {
        return new Promise((resolve, reject) => {
            const httpServer = http.createServer();

            // Setup proxy authorization
            httpServer.authenticate = function (req, fn) {
                // parse the "Proxy-Authorization" header
                const auth = req.headers['proxy-authorization'];
                if (!auth) {
                    // optimization: don't invoke the child process if no
                    // "Proxy-Authorization" header was given
                    // console.log('not Proxy-Authorization');
                    return fn(null, false);
                }
                const parsed = basicAuthParser(auth);
                const isEqual = _.isEqual(parsed, proxyAuth);
                console.log('parsed "Proxy-Authorization": %j - %s', parsed, isEqual);
                if (isEqual) wasProxyCalled = true;
                fn(null, isEqual);
            };

            httpServer.on('error', reject);

            proxyServer = proxy(httpServer);
            proxyServer.listen(ports[0], () => {
                proxyPort = proxyServer.address().port;
                resolve();
            });
        });
    });
});

after(function () {
    this.timeout(60 * 1000);
    if (proxyServer) return Promise.promisify(proxyServer.close).bind(proxyServer)();
});


describe('ProxyChainManager.addProxyChain()', function () {
    // Need larger timeout for Travis CI
    this.timeout(100 * 1000);

    let mng;
    before(() => {
        mng = new ProxyChainManager();
    });

    it('throws nice error when "squid" command not found', () => {
        PROXY_CHAIN.SQUID_CMD = 'command-that-does-not-exist';
        return mng.addProxyChain(parseUrl(`http://${proxyAuth.username}:${proxyAuth.password}@127.0.0.1:${proxyPort}`))
            .then(() => {
                assert.fail();
            })
            .catch((err) => {
                expect(err.message).to.contain('"squid" command not found in the PATH');
            })
            .finally(() => {
                Object.assign(PROXY_CHAIN, ORIG_PROXY_CHAIN);
            });
    });

    it('throws nice error when no more free ports available', () => {
        // we're listening on proxyPort
        PROXY_CHAIN.PORT_FROM = proxyPort;
        PROXY_CHAIN.PORT_TO = proxyPort;
        return mng.addProxyChain(parseUrl(`http://${proxyAuth.username}:${proxyAuth.password}@127.0.0.1:${proxyPort}`))
            .then(() => {
                assert.fail();
            })
            .catch((err) => {
                expect(err.message).to.contain('There are no more free ports');
            })
            .finally(() => {
                Object.assign(PROXY_CHAIN, ORIG_PROXY_CHAIN);
            });
    });

    it('creates a working proxy chain', () => {
        return mng.addProxyChain(parseUrl(`http://${proxyAuth.username}:${proxyAuth.password}@127.0.0.1:${proxyPort}`))
            .then((parsedChildProxyUrl) => {
                expect(parsedChildProxyUrl.port).to.not.equal(proxyPort);
                // console.log(`http://${proxyAuth.username}:${proxyAuth.password}@127.0.0.1:${proxyPort}`);
                // console.dir(parsedChildProxyUrl);

                return new Promise((resolve, reject) => {
                    const opts = {
                        uri: 'https://www.example.com',
                        proxy: `${parsedChildProxyUrl.protocol}//${parsedChildProxyUrl.host}:${parsedChildProxyUrl.port}`,
                    };
                    request(opts, (error, response, body) => {
                        if (error) return reject(error);
                        if (response.statusCode !== 200) return reject(new Error(`Received invalid response code: ${response.statusCode}`));
                        expect(body).to.contain('Example Domain');
                        resolve();
                    });
                });
            })
            .then(() => {
                expect(mng._isSquidRunning()).to.equal(true);
                expect(wasProxyCalled).to.equal(true);
            });
    });

    it('handles adding one more proxy', () => {
        // TODO
    });

    it('handles removal of first proxy', () => {

    });

    it('handles removal of second proxy', () => {

    });

    after(() => {
        Object.assign(PROXY_CHAIN, ORIG_PROXY_CHAIN);
    });
});
