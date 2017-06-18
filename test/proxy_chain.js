import fs from 'fs';
import _ from 'underscore';
import { expect, assert } from 'chai';
import proxy from 'proxy';
import http from 'http';
import portastic from 'portastic';
import basicAuthParser from 'basic-auth-parser';
import Promise from 'bluebird';
import request from 'request';

import { parseUrl } from '../build/utils';
import { ProxyChain, PROXY_CHAIN } from '../build/proxy_chain';

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
                // console.log('Parsed "Proxy-Authorization": parsed: %j expected: %j : %s', parsed, proxyAuth, isEqual);
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
    // console.log('requestPromised');
    // console.dir(opts);
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


describe('ProxyChain', function () {
    // Need larger timeout for Travis CI
    this.timeout(1000 * 1000);

    it('throws nice error when "squid" command not found', () => {
        PROXY_CHAIN.SQUID_CMD = 'command-that-does-not-exist';
        const pc = new ProxyChain(parseUrl('http://whatever.com:1234'));
        return pc.start()
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
        PROXY_CHAIN.SQUID_CMD = 'false';
        const pc = new ProxyChain(parseUrl('http://whatever.com:1234'));
        return pc.start()
            .then(() => {
                assert.fail();
            })
            .catch((err) => {
                expect(err.message).to.contain('exited unexpectedly');
            })
            .finally(() => {
                Object.assign(PROXY_CHAIN, ORIG_PROXY_CHAIN);
            });
    });

    it('throws nice error when no more free ports available', () => {
        // Testing proxy is already listening on proxyPort
        PROXY_CHAIN.PORT_FROM = proxyPort;
        PROXY_CHAIN.PORT_TO = proxyPort;
        const pc = new ProxyChain(parseUrl('http://whatever.com:1234'));
        return pc.start()
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

    it('throws for invalid args', () => {
        assert.throws(() => { new ProxyChain(null); }, Error); // eslint-disable-line no-new
    });

    it('throws for unsupported proxy protocols', () => {
        assert.throws(() => { new ProxyChain(parseUrl('socks://whatever.com')); }, Error); // eslint-disable-line no-new
        assert.throws(() => { new ProxyChain(parseUrl('https://whatever.com')); }, Error); // eslint-disable-line no-new
        assert.throws(() => { new ProxyChain(parseUrl('socks5://whatever.com')); }, Error); // eslint-disable-line no-new
    });

    it('throws for invalid URLs', () => {
        assert.throws(() => { new ProxyChain(parseUrl('://whatever.com')); }, Error); // eslint-disable-line no-new
        assert.throws(() => { new ProxyChain(parseUrl('https://whatever.com')); }, Error); // eslint-disable-line no-new
        assert.throws(() => { new ProxyChain(parseUrl('socks5://whatever.com')); }, Error); // eslint-disable-line no-new
        assert.throws(() => { new ProxyChain(parseUrl('http://no-port-provided')); }, Error); // eslint-disable-line no-new
    });

    it('works well', () => {
        // TODO: test maybe 5 proxies at the same time
        const proxyChain1 = new ProxyChain(parseUrl(`http://${proxyAuth.username}:${proxyAuth.password}@127.0.0.1:${proxyPort}`));
        const proxyChain2 = new ProxyChain(parseUrl(`http://${proxyAuth.username}:${proxyAuth.password}@127.0.0.1:${proxyPort}`));
        let parsedChildProxyUrl1;
        let parsedChildProxyUrl2;
        return Promise.resolve()
            .then(() => {
                return Promise.all([proxyChain1.start(), proxyChain2.start()]);
            })
            .then((results) => {
                parsedChildProxyUrl1 = results[0];
                parsedChildProxyUrl2 = results[1];
                expect(parsedChildProxyUrl1.port).to.not.equal(proxyPort);
                expect(parsedChildProxyUrl2.port).to.not.equal(proxyPort);
                expect(parsedChildProxyUrl1.port).to.not.equal(parsedChildProxyUrl2.port);

                // Test call through proxy 1
                wasProxyCalled = false;
                return requestPromised({
                    uri: 'https://www.example.com', // Test HTTPS
                    proxy: `${parsedChildProxyUrl1.protocol}//${parsedChildProxyUrl1.host}`,
                    expectBodyContainsText: 'Example Domain',
                });
            })
            .then(() => {
                expect(wasProxyCalled).to.equal(true);
            })
            .then(() => {
                // Test call through proxy 2
                wasProxyCalled = false;
                return requestPromised({
                    uri: 'http://www.example.com', // Test HTTP
                    proxy: `${parsedChildProxyUrl2.protocol}//${parsedChildProxyUrl2.host}`,
                    expectBodyContainsText: 'Example Domain',
                });
            })
            .then(() => {
                expect(wasProxyCalled).to.equal(true);
            })
            .then(() => {
                // Test again call through proxy 1
                wasProxyCalled = false;
                return requestPromised({
                    uri: 'http://www.example.com',
                    proxy: `${parsedChildProxyUrl1.protocol}//${parsedChildProxyUrl1.host}`,
                    expectBodyContainsText: 'Example Domain',
                });
            })
            .then(() => {
                expect(wasProxyCalled).to.equal(true);
            })
            .then(() => {
                proxyChain1.shutdown();
                proxyChain2.shutdown();

                // Test these can be called multiple times
                proxyChain1.shutdown();
                proxyChain2.shutdown();
            });
    });

    it('fails with invalid proxy credentials', () => {
        const proxyChain = new ProxyChain(parseUrl(`http://username:bad-password@127.0.0.1:${proxyPort}`));

        return Promise.resolve()
            .then(() => {
                return proxyChain.start();
            })
            .then((parsedChildProxyUrl) => {
                expect(parsedChildProxyUrl.port).to.not.equal(proxyPort);
                wasProxyCalled = false;
                return requestPromised({
                    uri: 'https://www.example.com',
                    proxy: `${parsedChildProxyUrl.protocol}//${parsedChildProxyUrl.host}`,
                    expectBodyContainsText: 'Example Domain',
                });
            })
            .then(() => {
                assert.fail();
            })
            .catch((err) => {
                expect(err.message).to.contains('tunneling socket could not be established');
                expect(wasProxyCalled).to.equal(false);
            })
            .then(() => {
                proxyChain.shutdown();
            });
    });

    it('cleans up properly after shutdown', () => {
        const proxyChain = new ProxyChain(parseUrl(`http://any:thing@127.0.0.1:${proxyPort}`));
        let tmpDir;

        return Promise.resolve()
            .then(() => {
                return proxyChain.start();
            })
            .then(() => {
                tmpDir = proxyChain.tmpDir;
                proxyChain.shutdown();
            })
            .then(() => {
                return new Promise((resolve) => {
                    setTimeout(resolve, 100);
                });
            })
            .then(() => {
                expect(fs.existsSync(tmpDir)).to.equal(false);
                expect(proxyChain._isSquidRunning()).to.equal(false);
            });
    });

    after(() => {
        Object.assign(PROXY_CHAIN, ORIG_PROXY_CHAIN);
    });
});
