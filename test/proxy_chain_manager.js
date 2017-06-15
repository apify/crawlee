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
let proxyAuth = { scheme: 'Basic', username: 'username', password: 'password' };
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
                console.log('Parsed "Proxy-Authorization": parsed: %j expected: %j : %s', parsed, proxyAuth, isEqual);
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


const requestPromised = (opts) => {
    console.log('requestPromised');
    console.dir(opts);
    return new Promise((resolve, reject) => {
        request(opts, (error, response, body) => {
            if (error) return reject(error);
            if (response.statusCode !== 200) {
                console.log('ERROR VOLE');
                // console.dir(response);
                console.dir(body);

                return reject(new Error(`Received invalid response code: ${response.statusCode}`));
            }
            if (opts.expectBodyContainsText) expect(body).to.contain(opts.expectBodyContainsText);
            resolve();
        });
    });
};


describe('ProxyChainManager.addProxyChain()', function () {
    // Need larger timeout for Travis CI
    this.timeout(1000 * 1000);

    let mng;
    before(() => {
        mng = new ProxyChainManager();
    });

    it('throws nice error when "squid" command not found', () => {
        PROXY_CHAIN.SQUID_CMD = 'command-that-does-not-exist';
        return mng.addProxyChain(parseUrl('http://whatever.com:1234'))
            .then(() => {
                assert.fail();
            })
            .catch((err) => {
                expect(err.message).to.contain('command not found in the PATH');
            })
            .finally(() => {
                Object.assign(PROXY_CHAIN, ORIG_PROXY_CHAIN);
            });
    });

    it('throws an error when "squid" command exits with non-zero code', () => {
        PROXY_CHAIN.SQUID_CHECK_ARGS = ['-xbadargs'];
        return mng.addProxyChain(parseUrl('http://whatever.com:1234'))
            .then(() => {
                assert.fail();
            })
            .catch((err) => {
                expect(err.message).to.contain('squid: illegal option');
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

    it('throws for unsupported proxy protocols', () => {
        assert.throws(() => { mng.addProxyChain(parseUrl('socks://whatever.com')); }, Error);
        assert.throws(() => { mng.addProxyChain(parseUrl('https://whatever.com')); }, Error);
        assert.throws(() => { mng.addProxyChain(parseUrl('socks5://whatever.com')); }, Error);
    });

    it('throws for invalid URLs', () => {
        assert.throws(() => { mng.addProxyChain(parseUrl('://whatever.com')); }, Error);
        assert.throws(() => { mng.addProxyChain(parseUrl('https://whatever.com')); }, Error);
        assert.throws(() => { mng.addProxyChain(parseUrl('socks5://whatever.com')); }, Error);

        assert.throws(() => { mng.addProxyChain(parseUrl('http://no-port-provided')); }, Error);
    });

    it('correctly handles add and removal', () => {
        let parsedChildProxyUrl1;
        let parsedChildProxyUrl2;
        let proxy1;
        let proxy2;
        const proxyAuth1 = { scheme: 'Basic', username: 'user1', password: 'password1' };
        const proxyAuth2 = { scheme: 'Basic', username: 'user2', password: 'password2' };
        return Promise.resolve()
            .then(() => {
                // Add first proxy
                console.log('*** Add first proxy');
                proxyAuth = proxyAuth1;
                return mng.addProxyChain(parseUrl(`http://${proxyAuth.username}:${proxyAuth.password}@127.0.0.1:${proxyPort}`));
            })
            .then((parsedChildProxyUrl) => {
                // Test first proxy works
                console.log('*** Test first proxy works');
                expect(parsedChildProxyUrl.port).to.not.equal(proxyPort);
                wasProxyCalled = false;
                parsedChildProxyUrl1 = parsedChildProxyUrl;
                proxy1 = `${parsedChildProxyUrl.protocol}//${parsedChildProxyUrl.host}`;
                return requestPromised({
                    uri: 'https://www.example.com', // Test HTTPS
                    proxy: proxy1,
                    expectBodyContainsText: 'Example Domain',
                })
                .then(() => {
                    expect(wasProxyCalled).to.equal(true);
                    expect(mng._isSquidRunning()).to.equal(true);
                });
            })
            .then(() => {
                // Add second proxy
                // NOTE: the host must be different than the first proxy (e.g. 127.0.0.1 vs localhost) !!!
                proxyAuth = proxyAuth2;
                return mng.addProxyChain(parseUrl(`http://${proxyAuth.username}:${proxyAuth.password}@localhost:${proxyPort}`));
            })
            .then((parsedChildProxyUrl) => {
                // Test second proxy works
                console.log('*** Test second proxy works');
                expect(parsedChildProxyUrl.port).to.not.equal(proxyPort);
                wasProxyCalled = false;
                parsedChildProxyUrl2 = parsedChildProxyUrl;
                proxy2 = `${parsedChildProxyUrl.protocol}//${parsedChildProxyUrl.host}}`;
                return requestPromised({
                    uri: 'http://www.example.com', // Test HTTP
                    proxy: proxy2,
                    expectBodyContainsText: 'Example Domain',
                })
                .then(() => {
                    expect(wasProxyCalled).to.equal(true);
                });
            })
            .then(() => {
                // Test first proxy still works
                console.log('*** Test first proxy still works');
                return new Promise(() => {}); // TODO
                proxyAuth = proxyAuth1;
                wasProxyCalled = false;
                return requestPromised({
                    uri: 'http://www.example.com',
                    proxy: proxy1,
                    expectBodyContainsText: 'Example Domain',
                })
                .then(() => {
                    expect(wasProxyCalled).to.equal(true);
                })
                .catch((err) => {
                    console.dir(err);
                    throw err;
                });
            })
            .then(() => {
                // Remove first proxy
                console.log('*** Remove first proxy');
                return mng.removeProxyChain(parsedChildProxyUrl1)
                    .then((wasRemoved) => {
                        expect(wasRemoved).to.equal(true);
                    });
            })
            .then(() => {
                // Remove first proxy again (should have no effect)
                console.log('*** Remove first proxy again');
                return mng.removeProxyChain(parsedChildProxyUrl1)
                    .then((wasRemoved) => {
                        expect(wasRemoved).to.equal(false);
                    });
            })
            .then(() => {
                // Check that second proxy still works
                console.log('*** Check that second proxy still works');
                proxyAuth = proxyAuth2;
                wasProxyCalled = false;
                return requestPromised({
                    uri: 'http://www.example.com',
                    proxy: proxy2,
                    expectBodyContainsText: 'Example Domain',
                });
            })
            .then(() => {
                // Check that first proxy no longer works
                console.log('*** Check that first proxy no longer works');
                proxyAuth = proxyAuth1;
                expect(wasProxyCalled).to.equal(true);
                return requestPromised({
                    uri: 'http://www.example.com',
                    proxy: proxy2,
                    expectBodyContainsText: 'Example Domain',
                })
                .then(() => {
                    assert.fail();
                })
                .catch((err) => {
                    expect(err.message).to.contain('There are no more free ports');
                });
            })
            .then(() => {
                // Remove second proxy
                return mng.removeProxyChain(parsedChildProxyUrl2);
            });
    });

    after(() => {
        Object.assign(PROXY_CHAIN, ORIG_PROXY_CHAIN);

        //return mng.shutdown();
    });
});
