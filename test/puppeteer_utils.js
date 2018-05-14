import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import Apify from '../build/index';
import { RequestQueue } from '../build/request_queue';

chai.use(chaiAsPromised);

/* global process, describe, it */

describe('Apify.utils.puppeteer', () => {
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

    it('enqueueRequestsFromClickableElements()', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true, dumpio: true });

        try {
            const page = await browser.newPage();
            await page.setContent(`<html>
                <head>
                    <title>Example</title>
                </head>
                <body>
                    <p>
                        The ships hung in the sky, much the <a class="click" href="https://example.com/a/b/first">way that</a> bricks don't.
                    </p>
                    <ul>
                        <li>These aren't the Droids you're looking for</li>
                        <li><a href="https://example.com/a/second">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
                        <li><a class="click" href="https://example.com/a/b/third">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
                    </ul>
                    <a class="click" href="https://another.com/a/fifth">The Greatest Science Fiction Quotes Of All Time</a>
                    <p>
                        Don't know, I don't know such stuff. I just do eyes, ju-, ju-, just eyes... just genetic design,
                        just eyes. You Nexus, huh? I design your <a class="click" href="http://cool.com/">eyes</a>.
                    </p>
                </body>
            </html>`);


            const enqueuedUrls = [];
            const queue = new RequestQueue('xxx');
            queue.addRequest = (request) => {
                expect(request.method).to.be.eql('POST');
                enqueuedUrls.push(request.url);

                return Promise.resolve();
            };
            const purls = [
                new Apify.PseudoUrl('https://example.com/[(\\w|-|/)*]'),
                new Apify.PseudoUrl('[http|https]://cool.com/'),
            ];

            await Apify.utils.puppeteer.enqueueRequestsFromClickableElements(page, '.click', purls, queue, { method: 'POST' });

            expect(enqueuedUrls).to.be.eql([
                'https://example.com/a/b/first',
                'https://example.com/a/b/third',
                'http://cool.com/',
            ]);
        } finally {
            browser.close();
        }
    });
});
