import { expect } from 'chai';
import Apify from '../build/index';

const { utils: { log } } = Apify;

/* global describe, it */

describe('Apify.utils.puppeteer', () => {
    let ll;
    before(() => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });
    after(() => {
        log.setLevel(ll);
    });

    it('injectJQuery()', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });

        try {
            const page = await browser.newPage();
            await page.goto('about:blank');

            // NOTE: Chrome already defines window.$ as alias to document.querySelector(),
            // (https://developers.google.com/web/tools/chrome-devtools/console/command-line-reference#queryselector)
            const result1 = await page.evaluate(() => {
                return {
                    isDefined: window.jQuery !== undefined,
                };
            });
            expect(result1).to.eql({
                isDefined: false,
            });

            await Apify.utils.puppeteer.injectJQuery(page);
            const result2 = await page.evaluate(() => {
                return {
                    isDefined: window.jQuery === window.$,
                    text: $('h1').text(),
                };
            });
            expect(result2).to.eql({
                isDefined: true,
                text: '',
            });
        } finally {
            browser.close();
        }
    });

    it('injectUnderscore()', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });

        try {
            const page = await browser.newPage();
            await page.goto('about:blank');

            const result1 = await page.evaluate(() => {
                return { isDefined: window._ !== undefined };
            });
            expect(result1).to.eql({ isDefined: false });

            await Apify.utils.puppeteer.injectUnderscore(page);
            const result2 = await page.evaluate(() => {
                return { isDefined: _.isEmpty({}) };
            });
            expect(result2).to.eql({ isDefined: true });
        } finally {
            browser.close();
        }
    });

    it('hideWebDriver()', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });

        try {
            const page = await browser.newPage();
            await page.goto('about:blank');

            // TODO: Jarda, please can you add unit test for this?
            /*
            const result1 = await page.evaluate(() => {
                return { isDefined: window._ !== undefined };
            });
            expect(result1).to.eql({ isDefined: false });

            await Apify.utils.puppeteer.hideWebDriver(page);
            const result2 = await page.evaluate(() => {
                return { isDefined: _.isEmpty({}) };
            });
            expect(result2).to.eql({ isDefined: true }); */
        } finally {
            browser.close();
        }
    });

    // TODO Remove with 1.0.0. This is here as a backwards comp for moving
    // the function from utils.puppeteer to utils.
    it('enqueueLinks() exists in this namespace', async () => {
        expect(Apify.utils.puppeteer.enqueueLinks).to.be.a('function');
        try {
            await Apify.utils.puppeteer.enqueueLinks({ page: {}, $: () => {} });
        } catch (err) {
            expect(err.message).to.be.eql('Only one of the parameters "options.page" or "options.$" must be provided!');
        }
    });

    it('supports blockResources() with default values', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });

        try {
            const page = await browser.newPage();
            await Apify.utils.puppeteer.blockResources(page);
            await page.goto('about:blank');

            // TODO: Write some proper unit test for this
        } finally {
            browser.close();
        }
    });

    it('supports blockResources() with nondefault values', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });

        try {
            const page = await browser.newPage();
            await Apify.utils.puppeteer.blockResources(page, ['font']);
            await page.goto('about:blank');

            // TODO: Write some proper unit test for this
        } finally {
            browser.close();
        }
    });

    it('supports cacheResponses()', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });
        const cache = {};

        const getResourcesLoadedFromWiki = async () => {
            let downloadedBytes = 0;
            const page = await browser.newPage();
            // Cache all javascript files, png files and svg files
            await Apify.utils.puppeteer.cacheResponses(page, cache, ['.js', /.+\.png/i, /.+\.svg/i]);
            page.on('response', async (response) => {
                if (cache[response.url()]) return;
                try {
                    const buffer = await response.buffer();
                    downloadedBytes += buffer.byteLength;
                } catch (e) {
                    // do nothing
                }
            });
            await page.goto('https://www.wikipedia.org/', { waitUntil: 'networkidle0' });
            await page.close();
            return downloadedBytes;
        };

        try {
            const bytesDownloadedOnFirstRun = await getResourcesLoadedFromWiki();
            const bytesDownloadedOnSecondRun = await getResourcesLoadedFromWiki();
            expect(bytesDownloadedOnSecondRun).to.be.below(bytesDownloadedOnFirstRun);
        } finally {
            await browser.close();
        }
    });

    it('cacheResponses() throws when rule with invalid type is provided', async () => {
        const mockedPage = {
            setRequestInterception: () => {},
            on: () => {},
        };

        const testRuleType = async (value) => {
            try {
                await Apify.utils.puppeteer.cacheResponses(mockedPage, {}, [value]);
            } catch (error) {
                // this is valid path for this test
                return;
            }

            expect(`Rule '${value}' should have thrown error`).to.be.equal('');
        };
        await testRuleType(0);
        await testRuleType(1);
        await testRuleType(null);
        await testRuleType([]);
        await testRuleType(['']);
        await testRuleType(() => {});
    });

    it('compileScript() works', async () => {
        const { compileScript } = Apify.utils.puppeteer;
        const scriptStringGood = 'await page.goto("about:blank"); return await page.content();';
        const scriptStringBad = 'for const while';
        const script = compileScript(scriptStringGood);

        expect(script).to.be.a('function');
        expect(script.toString()).to.be.eql(`async ({ page, request }) => {${scriptStringGood}}`);

        try {
            compileScript(scriptStringBad);
            throw new Error('Should fail.');
        } catch (err) {
            // TODO figure out why the err.message comes out empty in the logs.
            expect(err.message).to.include('Unexpected token const');
        }
        const browser = await Apify.launchPuppeteer({ headless: true });
        try {
            const page = await browser.newPage();
            const content = await script({ page });
            expect(content).to.be.a('string');
            expect(content).to.be.eql('<html><head></head><body></body></html>');
        } finally {
            browser.close();
        }
    });
});
