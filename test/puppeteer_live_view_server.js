import http from 'http';
import { expect, assert } from 'chai';
import Promise from 'bluebird';
import puppeteer from 'puppeteer';
import Apify from '../build/index';
import PuppeteerLiveViewServer, { PuppeteerLiveViewBrowser } from '../src/puppeteer_live_view_server';
import { ENV_VARS } from '../src/constants';

const PORT = 0;
const URL = 'thisshouldfailonclientonly';

const httpGet = (port) => {
    return new Promise((resolve, reject) => {
        const opts = {
            host: 'localhost',
            port,
        };
        http.get(opts, (res) => {
            let body = '';
            res.on('data', (d) => {
                body += d;
            });
            res.on('end', () => resolve(body));
            res.on('error', reject);
        });
    });
};

beforeEach(() => {
    process.env[ENV_VARS.CONTAINER_PORT] = PORT;
    process.env[ENV_VARS.CONTAINER_URL] = URL;
});

describe('Starting the PuppeteerLiveViewServer', () => {
    it('should start using Apify.launchPuppeteer()', async () => {
        const customPort = 1234;

        process.env[ENV_VARS.CONTAINER_PORT] = customPort;

        return Apify.launchPuppeteer({ liveView: true })
            .then((browser) => {
                return httpGet(customPort)
                    .catch(err => assert.fail(err, 'Server response.'))
                    .then((body) => {
                        expect(body.trim().substr(0, 15)).to.equal('<!doctype html>');
                    })
                    .then(() => browser.close());
            });
    });
    it('should start using PuppeteerLiveViewServer.startServer()', () => {
        const server = new PuppeteerLiveViewServer();
        return server.startServer()
            .then(() => {
                const { port } = server.httpServer.address();
                return httpGet(port);
            })
            .catch(err => assert.fail(err, 'Server response.'))
            .then((body) => {
                expect(body.trim().substr(0, 15)).to.equal('<!doctype html>');
                server.httpServer.close();
            });
    });
});

describe('Manipulate the PuppeteerLiveViewServer', () => {
    let server;

    beforeEach(() => {
        server = new PuppeteerLiveViewServer();
        return server.startServer();
    });

    afterEach(() => {
        server.httpServer.close();
        server = null;
    });

    it('should add and remove browsers', () => {
        let createHandler = 0;
        server.on('browsercreated', () => {
            createHandler++;
        });

        let destroyHandler = 0;
        server.on('browserdestroyed', () => {
            destroyHandler++;
        });

        const browsers = [];

        return puppeteer.launch()
            .then((browser) => {
                browsers.push(browser);
                return server.addBrowser(new PuppeteerLiveViewBrowser(browser, { id: 'B1' }));
            })
            .then(() => {
                expect(server.browsers.size).to.equal(1);
                expect(createHandler).to.equal(1);
            })
            .then(() => puppeteer.launch())
            .then((browser) => {
                browsers.push(browser);
                return server.addBrowser(new PuppeteerLiveViewBrowser(browser, { id: 'B2' }));
            })
            .then(() => {
                expect(server.browsers.size).to.equal(2);
                expect(createHandler).to.equal(2);
            })
            .then(() => server.deleteBrowser(server.browsers.values().next().value))
            .then(() => {
                expect(server.browsers.size).to.equal(1);
                expect(createHandler).to.equal(2);
                expect(destroyHandler).to.equal(1);
            })
            .then(() => Promise.all(browsers.map(browser => browser.close())));
    });
});
