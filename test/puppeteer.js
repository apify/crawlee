import { expect } from 'chai';
import Apify from '../build/index';

describe('Apify.launchPuppeteer()', function () {
    it('throws on invalid args', () => {
        expect(() => Apify.launchPuppeteer({ proxyUrl: 'invalidurl' })).to.throw(Error);
        expect(() => Apify.launchPuppeteer({ proxyUrl: 'http://host-without-port' })).to.throw(Error);
        expect(() => Apify.launchPuppeteer({ proxyUrl: 'invalid://somehost:1234' })).to.throw(Error);
        expect(() => Apify.launchPuppeteer({ proxyUrl: 'http://host-with-port.com:30' })).to.not.throw();
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

                return page.goto('https://example.com');
            })
            .then(() => page.content())
            .then(html => expect(html).to.include('<h1>Example Domain</h1>'))
            .then(() => browser.close());
    });
});
