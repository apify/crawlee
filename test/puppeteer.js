import { expect } from 'chai';
import proxy from 'proxy';
import http from 'http';
import portastic from 'portastic';
import basicAuthParser from 'basic-auth-parser';
import Promise from 'bluebird';
import _ from 'underscore';
import Apify from '../build/index';
import { ENV_VARS } from '../build/constants';


let prevEnvHeadless;

let proxyServer;
let proxyPort; // eslint-disable-line no-unused-vars
const proxyAuth = { scheme: 'Basic', username: 'username', password: 'password' };
let wasProxyCalled = false; // eslint-disable-line no-unused-vars

// Setup local proxy server for the tests
before(() => {
    prevEnvHeadless = process.env[ENV_VARS.HEADLESS];
    process.env[ENV_VARS.HEADLESS] = '1';

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
    process.env[ENV_VARS.HEADLESS] = prevEnvHeadless;

    this.timeout(5 * 1000);
    if (proxyServer) return Promise.promisify(proxyServer.close).bind(proxyServer)();
});


describe('Apify.launchPuppeteer()', () => {
    it('throws on invalid args', () => {
        expect(() => Apify.launchPuppeteer('some non-object')).to.throw(Error);
        expect(() => Apify.launchPuppeteer(1234)).to.throw(Error);

        expect(() => Apify.launchPuppeteer({ proxyUrl: 234 })).to.throw(Error);
        expect(() => Apify.launchPuppeteer({ proxyUrl: {} })).to.throw(Error);
        expect(() => Apify.launchPuppeteer({ proxyUrl: 'invalidurl' })).to.throw(Error);
        expect(() => Apify.launchPuppeteer({ proxyUrl: 'http://host-without-port' })).to.throw(Error);
        expect(() => Apify.launchPuppeteer({ proxyUrl: 'invalid://somehost:1234' })).to.throw(Error);
        expect(() => Apify.launchPuppeteer({ proxyUrl: 'https://somehost:1234' })).to.throw(Error);
        expect(() => Apify.launchPuppeteer({ proxyUrl: ' something really bad' })).to.throw(Error);

        expect(() => Apify.launchPuppeteer({ args: 'wrong args' })).to.throw(Error);
        expect(() => Apify.launchPuppeteer({ args: [12, 34] })).to.throw(Error);
    });

    it('opens https://www.example.com', () => {
        let browser;
        let page;

        return Apify
            .launchPuppeteer()
            .then((createdBrowser) => {
                browser = createdBrowser;

                return browser.newPage();
            })
            .then((openedPage) => {
                page = openedPage;

                return page.goto('https://www.example.com');
            })
            .then(() => page.content())
            .then(html => expect(html).to.include('<h1>Example Domain</h1>'))
            .then(() => browser.close());
    });

    it('opens https://www.example.com via proxy with authentication', () => {
        let browser;
        let page;

        // Test headless parameter
        process.env[ENV_VARS.HEADLESS] = false;

        return Apify.launchPuppeteer({
            headless: true,
            proxyUrl: `http://username:password@127.0.0.1:${proxyPort}`,
        })
        .then((createdBrowser) => {
            browser = createdBrowser;

            return browser.newPage();
        })
        .then((openedPage) => {
            page = openedPage;

            return page.goto('https://example.com');
        })
        .then(() => {
            expect(wasProxyCalled).to.eql(true);

            return page.content();
        })
        .then(html => expect(html).to.include('<h1>Example Domain</h1>'))
        .then(() => browser.close());
    });
});
