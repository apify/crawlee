import 'babel-polyfill';
import { expect } from 'chai';
import Apify from '../build/index';
import { computeUniqueKey } from '../build/request';

describe('Apify.RequestList', () => {
    it('should not accept to pages with same uniqueKey', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'https://example.com/1' },
                { url: 'https://example.com/1#same' },
            ],
        });

        await requestList.loadSources();

        expect(requestList.isEmpty()).to.be.eql(false);
        expect(requestList.fetchNextRequest().url).to.be.eql('https://example.com/1');
        expect(requestList.isEmpty()).to.be.eql(true);
        expect(requestList.fetchNextRequest()).to.be.eql(null);
    });

    it('should correctly initialized itself', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'https://example.com/1' }, // handled
                { url: 'https://example.com/2' }, // handled
                { url: 'https://example.com/3' },
                { url: 'https://example.com/4' }, // handleduniqueKeys
                { url: 'https://example.com/5' },
                { url: 'https://example.com/6' }, // handleduniqueKeys
                { url: 'https://example.com/7' },
                { url: 'https://example.com/8' },
            ],
            state: {
                handledFromFirst: 2,
                handledUniqueKeys: [
                    computeUniqueKey('https://example.com/4'),
                    computeUniqueKey('https://example.com/6'),
                ],
            },
        });

        await requestList.loadSources();

        expect(requestList.isEmpty()).to.be.eql(false);
        expect(requestList.fetchNextRequest().url).to.be.eql('https://example.com/3');
        expect(requestList.fetchNextRequest().url).to.be.eql('https://example.com/5');
        expect(requestList.fetchNextRequest().url).to.be.eql('https://example.com/7');
        expect(requestList.fetchNextRequest().url).to.be.eql('https://example.com/8');
        expect(requestList.isEmpty()).to.be.eql(true);
    });

    it('should correctly handle reclaimed pages', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'https://example.com/1' },
                { url: 'https://example.com/2' },
                { url: 'https://example.com/3' },
                { url: 'https://example.com/4' },
                { url: 'https://example.com/5' },
                { url: 'https://example.com/6' },
            ],
        });

        await requestList.loadSources();

        const request1 = requestList.fetchNextRequest();
        const request2 = requestList.fetchNextRequest();
        const request3 = requestList.fetchNextRequest();
        const request4 = requestList.fetchNextRequest();
        const request5 = requestList.fetchNextRequest();

        expect(request1.url).to.be.eql('https://example.com/1');
        expect(request2.url).to.be.eql('https://example.com/2');
        expect(request3.url).to.be.eql('https://example.com/3');
        expect(request4.url).to.be.eql('https://example.com/4');
        expect(request5.url).to.be.eql('https://example.com/5');
        expect(requestList.getState()).to.be.eql({ handledFromFirst: 0, handledUniqueKeys: [] });
        expect(requestList.isEmpty()).to.be.eql(false);

        requestList.markRequestHandled(request1);
        requestList.markRequestHandled(request2);
        requestList.reclaimRequest(request3);
        requestList.reclaimRequest(request4);
        expect(requestList.getState()).to.be.eql({ handledFromFirst: 2, handledUniqueKeys: [] });
        expect(requestList.isEmpty()).to.be.eql(false);

        requestList.markRequestHandled(request5);
        expect(requestList.getState()).to.be.eql({ handledFromFirst: 2, handledUniqueKeys: [computeUniqueKey(request5.url)] });
        expect(requestList.isEmpty()).to.be.eql(false);

        const reclaimed3 = requestList.fetchNextRequest();
        expect(reclaimed3.url).to.be.eql('https://example.com/3');
        const reclaimed4 = requestList.fetchNextRequest();
        expect(reclaimed4.url).to.be.eql('https://example.com/4');
        requestList.markRequestHandled(request4);
        expect(requestList.getState()).to.be.eql({
            handledFromFirst: 2,
            handledUniqueKeys: [
                computeUniqueKey(request5.url),
                computeUniqueKey(request4.url),
            ],
        });
        expect(requestList.isEmpty()).to.be.eql(false);

        requestList.markRequestHandled(request3);
        expect(requestList.getState()).to.be.eql({ handledFromFirst: 5, handledUniqueKeys: [] });
        expect(requestList.isEmpty()).to.be.eql(false);

        const request6 = requestList.fetchNextRequest();
        expect(request6.url).to.be.eql('https://example.com/6');
        expect(requestList.getState()).to.be.eql({ handledFromFirst: 5, handledUniqueKeys: [] });
        expect(requestList.isEmpty()).to.be.eql(true);

        requestList.reclaimRequest(request6);
        expect(requestList.getState()).to.be.eql({ handledFromFirst: 5, handledUniqueKeys: [] });
        expect(requestList.isEmpty()).to.be.eql(false);

        const reclaimed6 = requestList.fetchNextRequest();
        expect(reclaimed6.url).to.be.eql('https://example.com/6');
        expect(requestList.getState()).to.be.eql({ handledFromFirst: 5, handledUniqueKeys: [] });
        expect(requestList.isEmpty()).to.be.eql(true);

        requestList.markRequestHandled(reclaimed6);
        expect(requestList.getState()).to.be.eql({ handledFromFirst: 6, handledUniqueKeys: [] });
        expect(requestList.isEmpty()).to.be.eql(true);
    });
});
