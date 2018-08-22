import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import log from 'apify-shared/log';
import _ from 'underscore';
import { delayPromise } from 'apify-shared/utilities';
import * as Apify from '../build/index';

chai.use(chaiAsPromised);

describe('CheerioCrawler', () => {
    const comparator = (a, b) => {
        a = Number(/q=(\d+)$/.exec(a.url)[1]);
        b = Number(/q=(\d+)$/.exec(b.url)[1]);
        return a - b;
    };

    let logLevel;

    before(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    after(() => {
        log.setLevel(logLevel);
    });

    it('should work', async () => {
        const sources = [
            { url: 'http://example.com/?q=1' },
            { url: 'http://example.com/?q=2' },
            { url: 'http://example.com/?q=3' },
            { url: 'http://example.com/?q=4' },
            { url: 'http://example.com/?q=5' },
            { url: 'http://example.com/?q=6' },
        ];
        const processed = [];
        const failed = [];
        const requestList = new Apify.RequestList({ sources });
        const handlePageFunction = async ({ $, html, request }) => {
            request.userData.title = $('title').text();
            request.userData.html = html;
            processed.push(request);
        };

        const cheerioCrawler = new Apify.CheerioCrawler({
            requestList,
            minConcurrency: 2,
            maxConcurrency: 2,
            handlePageFunction,
            handleFailedRequestFunction: ({ request }) => failed.push(request),
        });

        await requestList.initialize();
        await cheerioCrawler.run();

        expect(processed).to.have.lengthOf(6);
        expect(failed).to.have.lengthOf(0);

        processed.sort(comparator);
        processed.forEach((request, id) => {
            expect(request.url).to.be.eql(sources[id].url);
            expect(request.userData.title).to.be.eql('Example Domain');
            expect(request.userData.html).to.be.a('string');
            expect(request.userData.html.length).not.to.be.eql(0);
        });
    });

    it('should work with custom request function', async () => {
        const sources = [
            { url: 'http://example.com/?q=0' },
            { url: 'http://example.com/?q=1' },
            { url: 'http://example.com/?q=2' },
            { url: 'http://example.com/?q=3' },
            { url: 'http://example.com/?q=4' },
            { url: 'http://example.com/?q=5' },
            { url: 'http://example.com/?q=6' },
        ];
        const processed = [];
        const failed = [];
        const requestList = new Apify.RequestList({ sources });
        const requestFunction = async ({ request }) => {
            await delayPromise(1);
            return `<html><head><title>${request.url[request.url.length - 1]}</title></head><body>Body</body></html>`;
        };
        const handlePageFunction = async ({ $, html, request }) => {
            request.userData.title = $('title').text();
            request.userData.html = html;
            processed.push(request);
        };

        const cheerioCrawler = new Apify.CheerioCrawler({
            requestList,
            minConcurrency: 2,
            maxConcurrency: 2,
            handlePageFunction,
            requestFunction,
            handleFailedRequestFunction: ({ request }) => failed.push(request),
        });

        await requestList.initialize();
        await cheerioCrawler.run();

        expect(processed).to.have.lengthOf(7);
        expect(failed).to.have.lengthOf(0);

        processed.sort(comparator);
        processed.forEach((request, id) => {
            expect(request.url).to.be.eql(sources[id].url);
            expect(request.userData.title).to.be.eql(String(id));
            expect(request.userData.html).to.be.a('string');
            expect(request.userData.html.length).not.to.be.eql(0);
        });
    });

    it('should abort and resume', async () => {
        const sources = _.range(100).map(index => ({ url: `https://example.com/?q=${index + 1}` }));
        let cheerioCrawler;
        let isStopped = false;
        const processed = [];
        const failed = [];
        const requestList = new Apify.RequestList({ sources });
        const requestFunction = async ({ request }) => {
            await delayPromise(2);
            return `<html><head><title>${request.url[request.url.length - 1]}</title></head><body>Body</body></html>`;
        };
        const handlePageFunction = async ({ $, html, request }) => {
            if (request.url.endsWith('45') && !isStopped) {
                await cheerioCrawler.abort();
                isStopped = true;
            } else {
                request.userData.title = $('title').text();
                request.userData.html = html;
                processed.push(request);
            }
        };

        cheerioCrawler = new Apify.CheerioCrawler({
            requestList,
            minConcurrency: 5,
            maxConcurrency: 5,
            requestFunction,
            handlePageFunction,
            handleFailedRequestFunction: ({ request }) => failed.push(request),
        });

        await requestList.initialize();
        await cheerioCrawler.run();

        expect(processed.length).to.be.within(40, 45);
        expect(failed).to.have.lengthOf(0);

        processed.sort(comparator);

        for (let i = 0; i < 12; i++) {
            const request = processed[i];
            expect(request.url).to.be.eql(sources[i].url);
            expect(request.userData.title).to.be.eql(request.url[request.url.length - 1]);
        }

        await Apify.utils.sleep(10); // Wait for event loop to unwind.
        await cheerioCrawler.run();

        expect(processed.length).to.be.within(100, 105);
        expect(failed).to.have.lengthOf(0);
        expect(new Set(processed.map(p => p.url))).to.be.eql(new Set(sources.map(s => s.url)));
        processed.forEach((request) => {
            expect(request.userData.title).to.be.eql(request.url[request.url.length - 1]);
        });
    });
});
