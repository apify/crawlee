import _ from 'underscore';
import { expect, assert } from 'chai';
import proxy from 'proxy';
import http from 'http';
import portastic from 'portastic';
import basicAuthParser from 'basic-auth-parser';
import Promise from 'bluebird';

import { processBrowseArgs, getDefaultBrowseOptions } from '../build/browser';
import Apifier from '../build/index';

/* globals process */

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
                // console.log('parsed "Proxy-Authorization": %j - %s', parsed, isEqual);
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

describe('getDefaultBrowseOptions()', () => {
    it('it works', () => {
        process.env.APIFY_HEADLESS = '1';
        const opts1 = getDefaultBrowseOptions();
        expect(opts1).to.eql({
            browserName: 'chrome',
            headless: true,
            proxyUrl: null,
            userAgent: null,
        });

        delete process.env.APIFY_HEADLESS;
        const opts2 = getDefaultBrowseOptions();
        expect(opts2).to.eql({
            browserName: 'chrome',
            headless: false,
            proxyUrl: null,
            userAgent: null,
        });
    });
});

describe('processBrowseArgs()', () => {
    it('it handles default parameters well', () => {
        const func = () => {};

        expect(processBrowseArgs()).to.eql({
            options: {
                url: 'about:blank',
            },
            callback: null,
        });

        expect(processBrowseArgs(func)).to.eql({
            options: {
                url: 'about:blank',
            },
            callback: func,
        });

        expect(processBrowseArgs('example.com', func)).to.eql({
            options: {
                url: 'example.com',
            },
            callback: func,
        });

        expect(processBrowseArgs('example.com', { opt: true }, func)).to.eql({
            options: {
                url: 'example.com',
                opt: true,
            },
            callback: func,
        });

        expect(processBrowseArgs('example.com', { opt: true })).to.eql({
            options: {
                url: 'example.com',
                opt: true,
            },
            callback: null,
        });

        expect(processBrowseArgs('example.com', { opt: true }, null)).to.eql({
            options: {
                url: 'example.com',
                opt: true,
            },
            callback: null,
        });

        expect(processBrowseArgs('example.com', { url: 'another.com' }, null)).to.eql({
            options: {
                url: 'example.com',
            },
            callback: null,
        });

        expect(processBrowseArgs({}, null)).to.eql({
            options: {
                url: 'about:blank',
            },
            callback: null,
        });

        expect(processBrowseArgs({ url: 'example.com' }, null)).to.eql({
            options: {
                url: 'example.com',
            },
            callback: null,
        });

        expect(processBrowseArgs({ url: 'example.com' }, func)).to.eql({
            options: {
                url: 'example.com',
            },
            callback: func,
        });

        expect(processBrowseArgs({ some: 123 }, func)).to.eql({
            options: {
                url: 'about:blank',
                some: 123,
            },
            callback: func,
        });
    });
});


describe('Apifier.browse()', function () {
    // Need a large timeout to run unit tests on Travis CI
    this.timeout(300 * 1000);

    it('throws on invalid args', () => {
        assert.throws(() => {
            Apifier.browse('http://www.blabla.bla', { proxyUrl: 'invalidurl' });
        }, Error);
        assert.throws(() => {
            Apifier.browse('http://www.blabla.bla', { proxyUrl: 'http://host-without-port' });
        }, Error);
        assert.throws(() => {
            Apifier.browse('http://www.blabla.bla', { proxyUrl: 'invalid://somehost:1234' });
        }, Error);
    });

    it('opens about:blank with no args', () => {
        process.env.APIFY_HEADLESS = '1';
        let browser;
        return Apifier.browse()
            .then((res) => {
                browser = res;
                expect(browser.constructor.name).to.eql('Browser');
                return browser.webDriver.getCurrentUrl();
            })
            .then((url) => {
                expect(url).to.eql('about:blank');
                return browser.close();
            });
    });

    it('opens https://www.example.com in headless mode', () => {
        delete process.env.APIFY_HEADLESS;
        let browser;
        return Apifier.browse('https://www.example.com', { headless: true })
            .then((res) => {
                browser = res;
                expect(browser.constructor.name).to.eql('Browser');
                return browser.webDriver.getCurrentUrl();
            })
            .then((url) => {
                expect(url).to.eql('https://www.example.com/');
                return browser.close();
            });
    });

    it('works with empty options and callback', () => {
        let browser;
        return new Promise((resolve, reject) => {
            try {
                process.env.APIFY_HEADLESS = '1';
                const retVal = Apifier.browse('about:blank', {}, (err, result) => {
                    if (err) return reject(err);
                    browser = result;
                    try {
                        expect(browser.constructor.name).to.eql('Browser');
                        browser.webDriver.getCurrentUrl()
                            .then((url) => {
                                expect(url).to.eql('about:blank');
                                resolve();
                            })
                            .catch(reject);
                    } catch (e) {
                        reject(e);
                    }
                });
                assert(!retVal, 'Apifier.browse() with callback should return false-ish value');
            } catch (e) {
                reject(e);
            }
        }).then(() => {
            return browser.close();
        });
    });

    it('works with proxy server', () => {
        let browser;
        wasProxyCalled = false;
        const opts = {
            url: 'https://www.example.com',
            headless: true,
            browserName: 'chrome',
            proxyUrl: `http://${proxyAuth.username}:${proxyAuth.password}@127.0.0.1:${proxyPort}`,
        };
        return Apifier.browse(opts)
            .then((result) => {
                browser = result;
            })
            .then(() => {
                // return browser.webDriver.sleep(300 * 1000);
            })
            .then(() => {
                return browser.webDriver.getAllWindowHandles();
            })
            .then(() => {
                expect(browser.constructor.name).to.eql('Browser');
                return browser.webDriver.getCurrentUrl();
            })
            .then((url) => {
                expect(wasProxyCalled).to.equal(true);
                expect(url).to.eql('https://www.example.com/');
                return browser.close();
            });
    });

    it('userAgent option works', () => {
        let browser;
        const opts = {
            url: 'http://www.whatsmyua.info/',
            headless: true,
            browserName: 'chrome',
            userAgent: 'MyUserAgent/1234',
        };
        return Apifier.browse(opts)
            .then((result) => {
                browser = result;
            })
            .then(() => {
                expect(browser.constructor.name).to.eql('Browser');
                return browser.webDriver.getPageSource();
            })
            .then((source) => {
                expect(source).to.contain(`rawUa: ${opts.userAgent}`);
                return browser.close();
            });
    });
});


// These tests don't work on Travis CI, we don't need launchChrome() anyway
// describe('launchChrome()', function () {
//     // Need a large timeout to run unit tests on Travis CI
//     this.timeout(300 * 1000);
//
//     let launcher;
//
//     before(() => {
//         process.env.APIFY_HEADLESS = '1';
//         return launchChrome().then((l) => {
//             launcher = l;
//         });
//     });
//
//     it('reports headless browser version', () => {
//         return Promise.resolve().then(() => {
//             return CDP.Version();
//         })
//         .then((version) => {
//             expect(version.Browser).to.contain('HeadlessChrome');
//             // console.dir(version);
//         });
//     });
//
//     it('opens http://www.example.com', () => {
//         function onPageLoad(Runtime) {
//             const js = 'document.querySelector("title").textContent';
//
//             // Evaluate the JS expression in the page.
//             return Runtime.evaluate({ expression: js })
//                 .then((result) => {
//                     console.log(`Title of page: ${result.result.value}`);
//                 });
//         }
//
//         return new Promise((resolve, reject) => {
//             CDP((protocol) => {
//                 // Extract the parts of the DevTools protocol we need for the task.
//                 // See API docs: https://chromedevtools.github.io/devtools-protocol/
//                 const { Page, Runtime } = protocol;
//
//                 // First, need to enable the domains we're going to use.
//                 Promise.all([
//                     Page.enable(),
//                     Runtime.enable(),
//                 ])
//                 .then(() => {
//                     Page.navigate({ url: 'https://www.example.com/' });
//
//                     // Wait for window.onload before doing stuff.
//                     Page.loadEventFired(() => {
//                         onPageLoad(Runtime)
//                         .then(() => {
//                             protocol.close();
//                             resolve();
//                         });
//                     });
//                 });
//             })
//             .on('error', reject);
//         });
//     });
//
//     // it('test github requests', () => {
//     //     return new Promise((resolve, reject) => {
//     //         CDP((client) => {
//     //             // extract domains
//     //             const { Network, Page } = client;
//     //             // setup handlers
//     //             Network.requestWillBeSent((params) => {
//     //                 console.log(params.request.url);
//     //             });
//     //             Page.loadEventFired(() => {
//     //                 client.close();
//     //             });
//     //             // enable events then start!
//     //             Promise.all([
//     //                 Network.enable(),
//     //                 Page.enable(),
//     //             ]).then(() => {
//     //                 return Page.navigate({ url: 'https://github.com' });
//     //             }).catch((err) => {
//     //                 console.error(err);
//     //                 client.close();
//     //                 resolve();
//     //             });
//     //         }).on('error', (err) => {
//     //             // cannot connect to the remote endpoint
//     //             console.error(err);
//     //             reject(err);
//     //         });
//     //     });
//     // });
//
//     after(() => {
//         if (launcher) return launcher.kill();
//     });
// });
