import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'underscore';
import 'babel-polyfill';
import { ENV_VARS } from '../build/constants';
import * as Apify from '../build/index';

chai.use(chaiAsPromised);

const shortSleep = (millis = 25) => new Promise(resolve => setTimeout(resolve, millis));

describe('PuppeteerPool', () => {
    let prevEnvHeadless;

    before(() => {
        prevEnvHeadless = process.env[ENV_VARS.HEADLESS];
        process.env[ENV_VARS.HEADLESS] = '1';
    });

    after(() => {
        process.env[ENV_VARS.HEADLESS] = prevEnvHeadless;
    });

    it('should work', async () => {
        process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
        process.env[ENV_VARS.PROXY_HOSTNAME] = 'my.host.com';
        process.env[ENV_VARS.PROXY_PORT] = 123;

        const pool = new Apify.PuppeteerPool({
            maxOpenPagesPerInstance: 3,
            abortInstanceAfterRequestCount: 5,
        });
        const browsers = [];

        // Open 6 pages 3 in both browsers.
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        await Promise.all(browsers);

        expect(_.values(pool.activeInstances).length).to.be.eql(2);
        expect(pool.activeInstances[0].activePages).to.be.eql(3);
        expect(pool.activeInstances[0].totalPages).to.be.eql(3);
        expect(pool.activeInstances[1].activePages).to.be.eql(3);
        expect(pool.activeInstances[1].totalPages).to.be.eql(3);

        // Close 2 pages in a first browser.
        await (await browsers[0]).close();
        await (await browsers[1]).close();
        await shortSleep();

        expect(_.values(pool.activeInstances).length).to.be.eql(2);
        expect(pool.activeInstances[0].activePages).to.be.eql(1);
        expect(pool.activeInstances[0].totalPages).to.be.eql(3);
        expect(pool.activeInstances[1].activePages).to.be.eql(3);
        expect(pool.activeInstances[1].totalPages).to.be.eql(3);

        // Open two more pages in first browser so it reaches 5 and gets retired.
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        await Promise.all(browsers);
        expect(_.values(pool.activeInstances).length).to.be.eql(1);
        expect(_.values(pool.retiredInstances).length).to.be.eql(1);
        expect(pool.activeInstances[1].activePages).to.be.eql(3);
        expect(pool.activeInstances[1].totalPages).to.be.eql(3);
        expect(pool.retiredInstances[0].activePages).to.be.eql(3);
        expect(pool.retiredInstances[0].totalPages).to.be.eql(5);

        // Open one more page to see that 3rd browser gets started.
        browsers.push(pool.newPage());
        await Promise.all(browsers);

        expect(_.values(pool.activeInstances).length).to.be.eql(2);
        expect(_.values(pool.retiredInstances).length).to.be.eql(1);
        expect(pool.activeInstances[1].activePages).to.be.eql(3);
        expect(pool.activeInstances[1].totalPages).to.be.eql(3);
        expect(pool.activeInstances[2].activePages).to.be.eql(1);
        expect(pool.activeInstances[2].totalPages).to.be.eql(1);
        expect(pool.retiredInstances[0].activePages).to.be.eql(3);
        expect(pool.retiredInstances[0].totalPages).to.be.eql(5);

        // Kill the remaning 3 pages from the 1st browser to see that it gets closed.
        await (await browsers[2]).close();
        await (await browsers[6]).close();

        // @TODO for some reason it fails here:
        // await (await browsers[7]).close();
        // await shortSleep();
        // expect(_.values(pool.retiredInstances).length).to.be.eql(0);

        // Cleanup everything.
        await pool.destroy();
        delete process.env[ENV_VARS.PROXY_PASSWORD];
        delete process.env[ENV_VARS.PROXY_HOSTNAME];
        delete process.env[ENV_VARS.PROXY_PORT];
    });

    it('kills hanging retired instances', async () => {
        process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
        process.env[ENV_VARS.PROXY_HOSTNAME] = 'my.host.com';
        process.env[ENV_VARS.PROXY_PORT] = 123;

        const pool = new Apify.PuppeteerPool({
            maxOpenPagesPerInstance: 3,
            abortInstanceAfterRequestCount: 5,
            instanceKillerIntervalMillis: 1000,
            killInstanceAfterMillis: 500,
        });
        const browsers = [];

        // Open 3 pages.
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        await Promise.all(browsers);
        expect(_.values(pool.activeInstances).length).to.be.eql(1);
        expect(_.values(pool.retiredInstances).length).to.be.eql(0);

        // Close 2.
        await (await browsers[0]).close();
        await (await browsers[1]).close();
        await shortSleep();
        expect(_.values(pool.activeInstances).length).to.be.eql(1);
        expect(_.values(pool.retiredInstances).length).to.be.eql(0);

        // Open 2 more so that the browser gets retired.
        browsers.push(pool.newPage());
        browsers.push(pool.newPage());
        await Promise.all(browsers);

        // Check that it's retired.
        expect(_.values(pool.activeInstances).length).to.be.eql(0);
        expect(_.values(pool.retiredInstances).length).to.be.eql(1);
        expect(pool.retiredInstances[0].activePages).to.be.eql(3);
        expect(pool.retiredInstances[0].totalPages).to.be.eql(5);

        // Sleep and check that it has been killed.
        await shortSleep(2100);
        expect(_.values(pool.activeInstances).length).to.be.eql(0);
        expect(_.values(pool.retiredInstances).length).to.be.eql(0);

        // Cleanup everything.
        await pool.destroy();
        delete process.env[ENV_VARS.PROXY_PASSWORD];
        delete process.env[ENV_VARS.PROXY_HOSTNAME];
        delete process.env[ENV_VARS.PROXY_PORT];
    });
});
