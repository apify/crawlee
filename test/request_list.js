import 'babel-polyfill';
import { expect } from 'chai';
import request from 'request-promise';
import sinon from 'sinon';
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

    it('should correctly load list from hosted files in correct order', async () => {
        const mock = sinon.mock(request);
        const list1 = [
            'https://example.com',
            'https://google.com',
            'https://wired.com',
        ];
        const list2 = [
            'https://another.com',
            'https://page.com',
        ];

        mock.expects('get')
            .once()
            .withArgs('http://example.com/list-1')
            .returns(new Promise(resolve => setTimeout(resolve(list1.join('\n')), 100)));

        mock.expects('get')
            .once()
            .withArgs('http://example.com/list-2')
            .returns(Promise.resolve(list2.join('\n')), 0);

        const requestList = new Apify.RequestList({
            sources: [
                { method: 'GET', requestsFromUrl: 'http://example.com/list-1' },
                { method: 'POST', requestsFromUrl: 'http://example.com/list-2' },
            ],
        });

        await requestList.loadSources();

        expect(requestList.fetchNextRequest()).to.include({ method: 'GET', url: list1[0] });
        expect(requestList.fetchNextRequest()).to.include({ method: 'GET', url: list1[1] });
        expect(requestList.fetchNextRequest()).to.include({ method: 'GET', url: list1[2] });
        expect(requestList.fetchNextRequest()).to.include({ method: 'POST', url: list2[0] });
        expect(requestList.fetchNextRequest()).to.include({ method: 'POST', url: list2[1] });

        mock.verify();
        mock.restore();
    });

    it('should support regex parameter for hosted file list', async () => {
        const mock = sinon.mock(request);
        const listStr = 'kjnjkn"https://example.com/a/b/c?q=1#abc";,"http://google.com/a/b/c";dgg:dd';
        const listArr = ['https://example.com/a/b/c?q=1#abc', 'http://google.com/a/b/c'];

        mock.expects('get')
            .once()
            .withArgs('http://example.com/list-1')
            .returns(Promise.resolve(listStr));

        const requestList = new Apify.RequestList({
            sources: [
                {
                    method: 'GET',
                    requestsFromUrl: 'http://example.com/list-1',
                    regex: '(http|https)://[\\w-]+(\\.[\\w-]+)+([\\w-.,@?^=%&:/~+#-]*[\\w@?^=%&;/~+#-])?',
                },
            ],
        });

        await requestList.loadSources();

        expect(requestList.fetchNextRequest()).to.include({ method: 'GET', url: listArr[0] });
        expect(requestList.fetchNextRequest()).to.include({ method: 'GET', url: listArr[1] });

        mock.verify();
        mock.restore();
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
