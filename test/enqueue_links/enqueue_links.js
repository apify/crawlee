import cheerio from 'cheerio';
import { expect } from 'chai';
import Apify from '../../build';
import { enqueueLinks } from '../../build/enqueue_links/enqueue_links';
import { RequestQueue } from '../../build/request_queue';

const { utils: { log } } = Apify;

const HTML = `
<html>
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
        <a href="/x/absolutepath">This is a relative link.</a>
        <a href="y/relativepath">This is a relative link.</a>
    </body>
</html>
`;

describe('enqueueLinks()', () => {
    let ll;
    before(() => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    after(() => {
        log.setLevel(ll);
    });

    describe('using Puppeteer', () => {
        let browser;
        let page;

        beforeEach(async () => {
            browser = await Apify.launchPuppeteer({ headless: true });
            page = await browser.newPage();
            await page.setContent(HTML);
        });

        afterEach(async () => {
            if (browser) await browser.close();
            page = null;
            browser = null;
        });

        it('works with PseudoUrl instances', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };
            const pseudoUrls = [
                new Apify.PseudoUrl('https://example.com/[(\\w|-|/)*]', { method: 'POST' }),
                new Apify.PseudoUrl('[http|https]://cool.com/', { userData: { foo: 'bar' } }),
            ];

            await enqueueLinks({ page, selector: '.click', requestQueue, pseudoUrls });

            expect(enqueued).to.have.lengthOf(3);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('POST');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('POST');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('http://cool.com/');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData.foo).to.be.eql('bar');
        });

        it('works with Actor UI output object', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };
            const pseudoUrls = [
                { purl: 'https://example.com/[(\\w|-|/)*]', method: 'POST' },
                { purl: '[http|https]://cool.com/', userData: { foo: 'bar' } },
            ];

            await enqueueLinks({ page, selector: '.click', requestQueue, pseudoUrls });

            expect(enqueued).to.have.lengthOf(3);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('POST');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('POST');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('http://cool.com/');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData.foo).to.be.eql('bar');
        });

        it('works with string pseudoUrls', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };
            const pseudoUrls = [
                'https://example.com/[(\\w|-|/)*]',
                '[http|https]://cool.com/',
            ];

            await enqueueLinks({ page, selector: '.click', requestQueue, pseudoUrls });

            expect(enqueued).to.have.lengthOf(3);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('GET');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('GET');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('http://cool.com/');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData).to.be.eql({});
        });

        it('works with RegExp pseudoUrls', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };
            const pseudoUrls = [
                /https:\/\/example\.com\/(\w|-|\/)*/,
                /(http|https):\/\/cool\.com\//,
            ];

            await enqueueLinks({ page, selector: '.click', requestQueue, pseudoUrls });

            expect(enqueued).to.have.lengthOf(3);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('GET');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('GET');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('http://cool.com/');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData).to.be.eql({});
        });

        it('works with undefined pseudoUrls[]', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };

            await enqueueLinks({ page, selector: '.click', requestQueue });

            expect(enqueued).to.have.lengthOf(4);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('GET');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('GET');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('https://another.com/a/fifth');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData).to.be.eql({});

            expect(enqueued[3].url).to.be.eql('http://cool.com/');
            expect(enqueued[3].method).to.be.eql('GET');
            expect(enqueued[3].userData).to.be.eql({});
        });

        it('works with null pseudoUrls[]', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };

            await enqueueLinks({ page, selector: '.click', requestQueue, pseudoUrls: null });

            expect(enqueued).to.have.lengthOf(4);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('GET');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('GET');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('https://another.com/a/fifth');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData).to.be.eql({});

            expect(enqueued[3].url).to.be.eql('http://cool.com/');
            expect(enqueued[3].method).to.be.eql('GET');
            expect(enqueued[3].userData).to.be.eql({});
        });

        it('works with empty pseudoUrls[]', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };

            await enqueueLinks({ page, selector: '.click', requestQueue, pseudoUrls: [] });

            expect(enqueued).to.have.lengthOf(4);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('GET');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('GET');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('https://another.com/a/fifth');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData).to.be.eql({});

            expect(enqueued[3].url).to.be.eql('http://cool.com/');
            expect(enqueued[3].method).to.be.eql('GET');
            expect(enqueued[3].userData).to.be.eql({});
        });

        it('throws with sparse pseudoUrls[]', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };
            const pseudoUrls = [
                new Apify.PseudoUrl('https://example.com/[(\\w|-|/)*]', { method: 'POST' }),
                null,
                new Apify.PseudoUrl('[http|https]://cool.com/', { userData: { foo: 'bar' } }),
            ];

            try {
                await enqueueLinks({ page, selector: '.click', requestQueue, pseudoUrls });
                throw new Error('Wrong error.');
            } catch (err) {
                expect(err.message).to.include('pseudoUrls[1]');
                expect(enqueued).to.have.lengthOf(0);
            }
        });

        it('DEPRECATED: enqueueRequestsFromClickableElements()', async () => {
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
        });
    });

    describe('using Cheerio', () => {
        let $;

        beforeEach(async () => {
            $ = cheerio.load(HTML);
        });

        afterEach(async () => {
            $ = null;
        });

        it('works from utils namespace', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };
            const pseudoUrls = [
                new Apify.PseudoUrl('https://example.com/[(\\w|-|/)*]', { method: 'POST' }),
                new Apify.PseudoUrl('[http|https]://cool.com/', { userData: { foo: 'bar' } }),
            ];

            await Apify.utils.enqueueLinks({ $, selector: '.click', requestQueue, pseudoUrls });

            expect(enqueued).to.have.lengthOf(3);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('POST');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('POST');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('http://cool.com/');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData.foo).to.be.eql('bar');
        });

        it('works with PseudoUrl instances', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };
            const pseudoUrls = [
                new Apify.PseudoUrl('https://example.com/[(\\w|-|/)*]', { method: 'POST' }),
                new Apify.PseudoUrl('[http|https]://cool.com/', { userData: { foo: 'bar' } }),
            ];

            await enqueueLinks({ $, selector: '.click', requestQueue, pseudoUrls });

            expect(enqueued).to.have.lengthOf(3);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('POST');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('POST');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('http://cool.com/');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData.foo).to.be.eql('bar');
        });

        it('works with Actor UI output object', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };
            const pseudoUrls = [
                { purl: 'https://example.com/[(\\w|-|/)*]', method: 'POST' },
                { purl: '[http|https]://cool.com/', userData: { foo: 'bar' } },
            ];

            await enqueueLinks({ $, selector: '.click', requestQueue, pseudoUrls });

            expect(enqueued).to.have.lengthOf(3);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('POST');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('POST');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('http://cool.com/');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData.foo).to.be.eql('bar');
        });

        it('works with string pseudoUrls', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };
            const pseudoUrls = [
                'https://example.com/[(\\w|-|/)*]',
                '[http|https]://cool.com/',
            ];

            await enqueueLinks({ $, selector: '.click', requestQueue, pseudoUrls });

            expect(enqueued).to.have.lengthOf(3);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('GET');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('GET');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('http://cool.com/');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData).to.be.eql({});
        });

        it('works with RegExp pseudoUrls', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };
            const pseudoUrls = [
                /https:\/\/example\.com\/(\w|-|\/)*/,
                /(http|https):\/\/cool\.com\//,
            ];

            await enqueueLinks({ $, selector: '.click', requestQueue, pseudoUrls });

            expect(enqueued).to.have.lengthOf(3);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('GET');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('GET');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('http://cool.com/');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData).to.be.eql({});
        });

        it('works with undefined pseudoUrls[]', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };

            await enqueueLinks({ $, selector: '.click', requestQueue });

            expect(enqueued).to.have.lengthOf(4);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('GET');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('GET');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('https://another.com/a/fifth');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData).to.be.eql({});

            expect(enqueued[3].url).to.be.eql('http://cool.com/');
            expect(enqueued[3].method).to.be.eql('GET');
            expect(enqueued[3].userData).to.be.eql({});
        });

        it('works with null pseudoUrls[]', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };

            await enqueueLinks({ $, selector: '.click', requestQueue, pseudoUrls: null });

            expect(enqueued).to.have.lengthOf(4);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('GET');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('GET');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('https://another.com/a/fifth');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData).to.be.eql({});

            expect(enqueued[3].url).to.be.eql('http://cool.com/');
            expect(enqueued[3].method).to.be.eql('GET');
            expect(enqueued[3].userData).to.be.eql({});
        });

        it('works with empty pseudoUrls[]', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };

            await enqueueLinks({ $, selector: '.click', requestQueue, pseudoUrls: [] });

            expect(enqueued).to.have.lengthOf(4);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('GET');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[1].method).to.be.eql('GET');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('https://another.com/a/fifth');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData).to.be.eql({});

            expect(enqueued[3].url).to.be.eql('http://cool.com/');
            expect(enqueued[3].method).to.be.eql('GET');
            expect(enqueued[3].userData).to.be.eql({});
        });

        it('throws with sparse pseudoUrls[]', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };
            const pseudoUrls = [
                new Apify.PseudoUrl('https://example.com/[(\\w|-|/)*]', { method: 'POST' }),
                null,
                new Apify.PseudoUrl('[http|https]://cool.com/', { userData: { foo: 'bar' } }),
            ];

            try {
                await enqueueLinks({ $, selector: '.click', requestQueue, pseudoUrls });
                throw new Error('Wrong error.');
            } catch (err) {
                expect(err.message).to.include('pseudoUrls[1]');
                expect(enqueued).to.have.lengthOf(0);
            }
        });

        it('correctly resolves relative URLs', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };

            await enqueueLinks({ $, requestQueue, baseUrl: 'http://www.absolute.com/removethis/' });

            expect(enqueued).to.have.lengthOf(7);

            expect(enqueued[0].url).to.be.eql('https://example.com/a/b/first');
            expect(enqueued[0].method).to.be.eql('GET');
            expect(enqueued[0].userData).to.be.eql({});

            expect(enqueued[1].url).to.be.eql('https://example.com/a/second');
            expect(enqueued[1].method).to.be.eql('GET');
            expect(enqueued[1].userData).to.be.eql({});

            expect(enqueued[2].url).to.be.eql('https://example.com/a/b/third');
            expect(enqueued[2].method).to.be.eql('GET');
            expect(enqueued[2].userData).to.be.eql({});

            expect(enqueued[3].url).to.be.eql('https://another.com/a/fifth');
            expect(enqueued[3].method).to.be.eql('GET');
            expect(enqueued[3].userData).to.be.eql({});

            expect(enqueued[4].url).to.be.eql('http://cool.com/');
            expect(enqueued[4].method).to.be.eql('GET');
            expect(enqueued[4].userData).to.be.eql({});

            expect(enqueued[5].url).to.be.eql('http://www.absolute.com/x/absolutepath');
            expect(enqueued[5].method).to.be.eql('GET');
            expect(enqueued[5].userData).to.be.eql({});

            expect(enqueued[6].url).to.be.eql('http://www.absolute.com/removethis/y/relativepath');
            expect(enqueued[6].method).to.be.eql('GET');
            expect(enqueued[6].userData).to.be.eql({});
        });

        it('throws on finding a relative link with no baseUrl set', async () => {
            const enqueued = [];
            const requestQueue = new RequestQueue('xxx');
            requestQueue.addRequest = async (request) => {
                enqueued.push(request);
            };
            try {
                await enqueueLinks({ $, requestQueue });
                throw new Error('wrong error');
            } catch (err) {
                expect(err.message).to.include('/x/absolutepath');
            }
            expect(enqueued).to.have.lengthOf(0);
        });
    });
});
