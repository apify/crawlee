import chai, { expect } from 'chai';
import fs from 'fs';
import chaiAsPromised from 'chai-as-promised';
import _ from 'underscore';
import log from 'apify-shared/log';
import 'babel-polyfill';
import { ENV_VARS } from '../build/constants';
import * as Apify from '../build/index';

chai.use(chaiAsPromised);

const shortSleep = (millis = 25) => new Promise(resolve => setTimeout(resolve, millis));

describe('PuppeteerPool', () => {
    let prevEnvHeadless;
    let logLevel;

    before(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
        prevEnvHeadless = process.env[ENV_VARS.HEADLESS];
        process.env[ENV_VARS.HEADLESS] = '1';
    });

    after(() => {
        log.setLevel(logLevel);
        process.env[ENV_VARS.HEADLESS] = prevEnvHeadless;
    });

    it('should work', async () => {
        process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
        process.env[ENV_VARS.PROXY_HOSTNAME] = 'my.host.com';
        process.env[ENV_VARS.PROXY_PORT] = 123;

        const pool = new Apify.PuppeteerPool({
            maxOpenPagesPerInstance: 3,
            retireInstanceAfterRequestCount: 5,
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
            retireInstanceAfterRequestCount: 5,
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

    it('retire manually', async () => {
        process.env[ENV_VARS.PROXY_PASSWORD] = 'abc123';
        process.env[ENV_VARS.PROXY_HOSTNAME] = 'my.host.com';
        process.env[ENV_VARS.PROXY_PORT] = 123;

        const pool = new Apify.PuppeteerPool({
            maxOpenPagesPerInstance: 1,
            abortInstanceAfterRequestCount: 5,
            instanceKillerIntervalMillis: 1000,
            killInstanceAfterMillis: 500,
        });
        const pages = [];

        // Open 3 pages.
        pages.push(pool.newPage());
        pages.push(pool.newPage());
        pages.push(pool.newPage());
        await Promise.all(pages);
        expect(_.values(pool.activeInstances).length).to.be.eql(3);
        expect(_.values(pool.retiredInstances).length).to.be.eql(0);

        // Retire 1.
        await pool.retire((await pages[0]).browser());
        expect(_.values(pool.activeInstances).length).to.be.eql(2);
        expect(_.values(pool.retiredInstances).length).to.be.eql(1);

        // Retire 2.
        await pool.retire((await pages[1]).browser());
        expect(_.values(pool.activeInstances).length).to.be.eql(1);
        expect(_.values(pool.retiredInstances).length).to.be.eql(2);

        // Sleep and check that two have been killed.
        await shortSleep(2100);
        expect(_.values(pool.activeInstances).length).to.be.eql(1);
        expect(_.values(pool.retiredInstances).length).to.be.eql(0);

        // Cleanup everything.
        await pool.destroy();
        delete process.env[ENV_VARS.PROXY_PASSWORD];
        delete process.env[ENV_VARS.PROXY_HOSTNAME];
        delete process.env[ENV_VARS.PROXY_PORT];
    });

    it('works with one page per instance', async () => {
        const pool = new Apify.PuppeteerPool({
            maxOpenPagesPerInstance: 1,
            retireInstanceAfterRequestCount: 1,
        });

        const page1 = await pool.newPage();
        await page1.goto('about:blank');
        const pid1 = page1.browser().process().pid;

        const page2 = await pool.newPage();
        await page2.goto('about:blank');
        const pid2 = page2.browser().process().pid;

        await page1.close();
        await page2.close();

        const page3 = await pool.newPage();
        await page3.goto('about:blank');
        const pid3 = page3.browser().process().pid;

        await page3.close();

        // Ensure we spawned 3 different processes
        expect(pid1).not.to.be.eql(pid2);
        expect(pid2).not.to.be.eql(pid3);
        expect(pid3).not.to.be.eql(pid1);

        // Cleanup everything.
        await pool.destroy();
    });

    it('supports recycleDiskCache option', async () => {
        const isMacOs = false; // process.platform === 'darwin';

        const pool = new Apify.PuppeteerPool({
            maxOpenPagesPerInstance: 1,
            retireInstanceAfterRequestCount: 1,
            recycleDiskCache: true,
            launchPuppeteerOptions: { headless: !isMacOs },
        });

        // log.setLevel(log.LEVELS.DEBUG);

        const url = 'https://www.wikipedia.org';

        const page1 = await pool.newPage();
        const dir1 = page1.browser().recycleDiskCacheDir;

        expect(fs.existsSync(dir1)).to.be.eql(true);

        // First time, nothing can come from disk cache
        let fromDiskCache1 = 0;
        page1.on('response', (response) => {
            if (response._fromDiskCache) fromDiskCache1++; // eslint-disable-line no-underscore-dangle
            // console.log(response._url + ": " + response.fromCache() + "/" + response._fromDiskCache);
        });

        const cookies1before = await page1.cookies(url);
        expect(cookies1before.length).to.be.eql(0);

        await page1.goto(url);

        expect(fromDiskCache1).to.be.eql(0);

        await Apify.utils.sleep(1000);

        const cookies1after = await page1.cookies();
        expect(cookies1after.length).to.be.at.least(1);

        await page1.close();

        // Wait for browser to close
        await Apify.utils.sleep(5000);

        // User directory must be the same
        const page2 = await pool.newPage();
        const dir2 = page2.browser().recycleDiskCacheDir;
        expect(dir1).to.be.eql(dir2);
        expect(fs.existsSync(dir2)).to.be.eql(true);

        // Ensure at least few assets are loaded from disk cache
        let fromDiskCache2 = 0;
        page2.on('response', (response) => {
            if (response._fromDiskCache) fromDiskCache2++; // eslint-disable-line no-underscore-dangle
        });

        const cookies2before = await page2.cookies(url);
        expect(cookies2before.length).to.be.eql(0);

        await page2.goto(url);

        const cookies2after = await page2.cookies(url);
        expect(cookies2after.length).to.be.at.least(1);

        // TODO: This only works in headful mode now, but must work all the time
        // See https://bugs.chromium.org/p/chromium/issues/detail?id=882431
        if (isMacOs) {
            expect(fromDiskCache2).to.be.at.least(1);
        }

        // Open third browser while second is still open, it should use a new cache directory
        const page3 = await pool.newPage();
        const dir3 = page3.browser().recycleDiskCacheDir;
        expect(dir3).not.to.be.eql(dir2);
        expect(fs.existsSync(dir3)).to.be.eql(true);

        await page2.close();

        // Cleanup everything.
        await pool.destroy();

        // Check cache dirs were deleted
        await Apify.utils.sleep(1000);
        expect(fs.existsSync(dir1)).to.be.eql(false);
        expect(fs.existsSync(dir3)).to.be.eql(false);
    });
});
