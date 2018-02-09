import 'babel-polyfill';
import { expect } from 'chai';
import request from 'request-promise';
import sinon from 'sinon';
import Apify from '../build/index';

describe('Apify.RequestList', () => {
    it('should not accept to pages with same uniqueKey', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'https://example.com/1' },
                { url: 'https://example.com/1#same' },
            ],
        });

        await requestList.initialize();

        expect(requestList.isEmpty()).to.be.eql(false);

        const req = requestList.fetchNextRequest();

        expect(req.url).to.be.eql('https://example.com/1');
        expect(requestList.isEmpty()).to.be.eql(true);
        expect(requestList.isFinished()).to.be.eql(false);
        expect(requestList.fetchNextRequest()).to.be.eql(null);

        requestList.markRequestHandled(req);

        expect(requestList.isEmpty()).to.be.eql(true);
        expect(requestList.isFinished()).to.be.eql(true);
    });

    it('must be initialized before using any of the methods', async () => {
        const requestList = new Apify.RequestList({ sources: [{ url: 'https://example.com' }] });
        const requestObj = new Apify.Request({ url: 'https://example.com' });

        expect(() => requestList.isEmpty()).to.throw();
        expect(() => requestList.isFinished()).to.throw();
        expect(() => requestList.getState()).to.throw();
        expect(() => requestList.markRequestHandled(requestObj)).to.throw();
        expect(() => requestList.reclaimRequest(requestObj)).to.throw();
        expect(() => requestList.fetchNextRequest()).to.throw();

        await requestList.initialize();

        expect(() => requestList.isEmpty()).to.not.throw();
        expect(() => requestList.isFinished()).to.not.throw();
        expect(() => requestList.getState()).to.not.throw();
        expect(() => requestList.fetchNextRequest()).to.not.throw();
        expect(() => requestList.reclaimRequest(requestObj)).to.not.throw();
        expect(() => requestList.fetchNextRequest()).to.not.throw();
        expect(() => requestList.markRequestHandled(requestObj)).to.not.throw();
    });

    it('should correctly initialized itself', async () => {
        const sources = [
            { url: 'https://example.com/1' },
            { url: 'https://example.com/2' },
            { url: 'https://example.com/3' },
            { url: 'https://example.com/4' },
            { url: 'https://example.com/5' },
            { url: 'https://example.com/6' },
            { url: 'https://example.com/7' },
            { url: 'https://example.com/8' },
        ];

        const originalList = new Apify.RequestList({ sources });
        await originalList.initialize();

        const r1 = originalList.fetchNextRequest(); // 1
        const r2 = originalList.fetchNextRequest(); // 2
        originalList.fetchNextRequest(); // 3
        const r4 = originalList.fetchNextRequest(); // 4
        const r5 = originalList.fetchNextRequest(); // 5
        originalList.fetchNextRequest(); // 6

        originalList.markRequestHandled(r1);
        originalList.markRequestHandled(r2);
        originalList.markRequestHandled(r4);
        originalList.reclaimRequest(r5);

        const newList = new Apify.RequestList({
            sources,
            state: originalList.getState(),
        });
        await newList.initialize();

        expect(newList.isEmpty()).to.be.eql(false);
        expect(newList.fetchNextRequest().url).to.be.eql('https://example.com/3');
        expect(newList.fetchNextRequest().url).to.be.eql('https://example.com/5');
        expect(newList.fetchNextRequest().url).to.be.eql('https://example.com/6');
        expect(newList.fetchNextRequest().url).to.be.eql('https://example.com/7');
        expect(newList.fetchNextRequest().url).to.be.eql('https://example.com/8');
        expect(newList.isEmpty()).to.be.eql(true);
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

        await requestList.initialize();

        expect(requestList.fetchNextRequest()).to.include({ method: 'GET', url: list1[0] });
        expect(requestList.fetchNextRequest()).to.include({ method: 'GET', url: list1[1] });
        expect(requestList.fetchNextRequest()).to.include({ method: 'GET', url: list1[2] });
        expect(requestList.fetchNextRequest()).to.include({ method: 'POST', url: list2[0] });
        expect(requestList.fetchNextRequest()).to.include({ method: 'POST', url: list2[1] });

        mock.verify();
        mock.restore();
    });

    it('should use regex parameter to parse urls', async () => {
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
                },
            ],
        });

        await requestList.initialize();

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

        await requestList.initialize();

        //
        // Fetch first 5 urls
        //

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
        expect(requestList.getState()).to.be.eql({
            inProgress: {
                'https://example.com/1': true,
                'https://example.com/2': true,
                'https://example.com/3': true,
                'https://example.com/4': true,
                'https://example.com/5': true,
            },
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(requestList.isEmpty()).to.be.eql(false);
        expect(requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Mark 1st, 2nd handled
        // Reclaim 3rd 4th
        //

        requestList.markRequestHandled(request1);
        requestList.markRequestHandled(request2);
        requestList.reclaimRequest(request3);
        requestList.reclaimRequest(request4);

        expect(requestList.getState()).to.be.eql({
            inProgress: {
                'https://example.com/3': true,
                'https://example.com/4': true,
                'https://example.com/5': true,
            },
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(requestList.isEmpty()).to.be.eql(false);
        expect(requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Mark 5th handled
        //

        requestList.markRequestHandled(request5);

        expect(requestList.getState()).to.be.eql({
            inProgress: {
                'https://example.com/3': true,
                'https://example.com/4': true,
            },
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(requestList.isEmpty()).to.be.eql(false);
        expect(requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Fetch 3rd and 4th
        // Mark 4th handled
        //

        const reclaimed3 = requestList.fetchNextRequest();
        expect(reclaimed3.url).to.be.eql('https://example.com/3');
        const reclaimed4 = requestList.fetchNextRequest();
        expect(reclaimed4.url).to.be.eql('https://example.com/4');
        requestList.markRequestHandled(request4);

        expect(requestList.getState()).to.be.eql({
            inProgress: {
                'https://example.com/3': true,
            },
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(requestList.isEmpty()).to.be.eql(false);
        expect(requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Mark 3rd handled
        //

        requestList.markRequestHandled(request3);

        expect(requestList.getState()).to.be.eql({
            inProgress: {},
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(requestList.isEmpty()).to.be.eql(false);
        expect(requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Fetch 6th
        //

        const request6 = requestList.fetchNextRequest();

        expect(request6.url).to.be.eql('https://example.com/6');
        expect(requestList.fetchNextRequest()).to.be.eql(null);
        expect(requestList.getState()).to.be.eql({
            inProgress: {
                'https://example.com/6': true,
            },
            nextIndex: 6,
            nextUniqueKey: null,
        });
        expect(requestList.isEmpty()).to.be.eql(true);
        expect(requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Reclaim 6th
        //

        requestList.reclaimRequest(request6);

        expect(requestList.getState()).to.be.eql({
            inProgress: {
                'https://example.com/6': true,
            },
            nextIndex: 6,
            nextUniqueKey: null,
        });
        expect(requestList.isEmpty()).to.be.eql(false);
        expect(requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Fetch 6th
        //

        const reclaimed6 = requestList.fetchNextRequest();

        expect(reclaimed6.url).to.be.eql('https://example.com/6');
        expect(requestList.getState()).to.be.eql({
            inProgress: {
                'https://example.com/6': true,
            },
            nextIndex: 6,
            nextUniqueKey: null,
        });
        expect(requestList.isEmpty()).to.be.eql(true);
        expect(requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Mark 6th handled
        //

        requestList.markRequestHandled(reclaimed6);

        expect(requestList.getState()).to.be.eql({
            inProgress: {},
            nextIndex: 6,
            nextUniqueKey: null,
        });
        expect(requestList.isEmpty()).to.be.eql(true);
        expect(requestList.isFinished()).to.be.eql(true);
        expect(requestList.inProgress).to.include(requestList.reclaimed);
    });
});
