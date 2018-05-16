import 'babel-polyfill';
import _ from 'underscore';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import request from 'request-promise';
import sinon from 'sinon';
import { delayPromise } from 'apify-shared/utilities';
import Apify from '../build/index';
import * as keyValueStore from '../build/key_value_store';
import { ACTOR_EVENT_NAMES } from '../build/constants';

chai.use(chaiAsPromised);

describe('Apify.RequestList', () => {
    it('should not accept to pages with same uniqueKey', async () => {
        const requestList = new Apify.RequestList({
            sources: [
                { url: 'https://example.com/1' },
                { url: 'https://example.com/1#same' },
            ],
        });

        await requestList.initialize();

        expect(await requestList.isEmpty()).to.be.eql(false);

        const req = await requestList.fetchNextRequest();

        expect(req.url).to.be.eql('https://example.com/1');
        expect(await requestList.isEmpty()).to.be.eql(true);
        expect(await requestList.isFinished()).to.be.eql(false);
        expect(await requestList.fetchNextRequest()).to.be.eql(null);

        await requestList.markRequestHandled(req);

        expect(await requestList.isEmpty()).to.be.eql(true);
        expect(await requestList.isFinished()).to.be.eql(true);
    });

    it('must be initialized before using any of the methods', async () => {
        const requestList = new Apify.RequestList({ sources: [{ url: 'https://example.com' }] });
        const requestObj = new Apify.Request({ url: 'https://example.com' });

        await expect(requestList.isEmpty()).to.be.rejectedWith();
        await expect(requestList.isFinished()).to.be.rejectedWith();
        expect(() => requestList.getState()).to.throw();
        await expect(requestList.markRequestHandled(requestObj)).to.be.rejectedWith();
        await expect(requestList.reclaimRequest(requestObj)).to.be.rejectedWith();
        await expect(requestList.fetchNextRequest()).to.be.rejectedWith();

        await requestList.initialize();

        await expect(requestList.isEmpty()).to.not.be.rejectedWith();
        await expect(requestList.isFinished()).to.not.be.rejectedWith();
        expect(() => requestList.getState()).to.not.throw();
        await expect(requestList.fetchNextRequest()).to.not.be.rejectedWith();
        await expect(requestList.reclaimRequest(requestObj)).to.not.be.rejectedWith();
        await expect(requestList.fetchNextRequest()).to.not.be.rejectedWith();
        await expect(requestList.markRequestHandled(requestObj)).to.not.be.rejectedWith();
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

        const r1 = await originalList.fetchNextRequest(); // 1
        const r2 = await originalList.fetchNextRequest(); // 2
        await originalList.fetchNextRequest(); // 3
        const r4 = await originalList.fetchNextRequest(); // 4
        const r5 = await originalList.fetchNextRequest(); // 5
        await originalList.fetchNextRequest(); // 6

        await originalList.markRequestHandled(r1);
        await originalList.markRequestHandled(r2);
        await originalList.markRequestHandled(r4);
        await originalList.reclaimRequest(r5);

        const newList = new Apify.RequestList({
            sources,
            state: originalList.getState(),
        });
        await newList.initialize();

        expect(await newList.isEmpty()).to.be.eql(false);
        expect((await newList.fetchNextRequest()).url).to.be.eql('https://example.com/3');
        expect((await newList.fetchNextRequest()).url).to.be.eql('https://example.com/5');
        expect((await newList.fetchNextRequest()).url).to.be.eql('https://example.com/6');
        expect((await newList.fetchNextRequest()).url).to.be.eql('https://example.com/7');
        expect((await newList.fetchNextRequest()).url).to.be.eql('https://example.com/8');
        expect(await newList.isEmpty()).to.be.eql(true);
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

        expect(await requestList.fetchNextRequest()).to.include({ method: 'GET', url: list1[0] });
        expect(await requestList.fetchNextRequest()).to.include({ method: 'GET', url: list1[1] });
        expect(await requestList.fetchNextRequest()).to.include({ method: 'GET', url: list1[2] });
        expect(await requestList.fetchNextRequest()).to.include({ method: 'POST', url: list2[0] });
        expect(await requestList.fetchNextRequest()).to.include({ method: 'POST', url: list2[1] });

        mock.verify();
        mock.restore();
    });

    it('should use regex parameter to parse urls', async () => {
        const mock = sinon.mock(request);
        const listStr = 'kjnjkn"https://example.com/a/b/c?q=1#abc";,"HTTP://google.com/a/b/c";dgg:dd';
        const listArr = ['https://example.com/a/b/c?q=1#abc', 'HTTP://google.com/a/b/c'];

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

        expect(await requestList.fetchNextRequest()).to.include({ method: 'GET', url: listArr[0] });
        expect(await requestList.fetchNextRequest()).to.include({ method: 'GET', url: listArr[1] });

        mock.verify();
        mock.restore();
    });

    it('should handle requestsFromUrl with no URLs', async () => {
        const mock = sinon.mock(request);
        mock.expects('get')
            .once()
            .withArgs('http://example.com/list-1')
            .returns(Promise.resolve('bla bla bla'));

        const requestList = new Apify.RequestList({
            sources: [
                {
                    method: 'GET',
                    requestsFromUrl: 'http://example.com/list-1',
                },
            ],
        });

        await requestList.initialize();

        expect(await requestList.fetchNextRequest()).to.eql(null);

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

        const request1 = await requestList.fetchNextRequest();
        const request2 = await requestList.fetchNextRequest();
        const request3 = await requestList.fetchNextRequest();
        const request4 = await requestList.fetchNextRequest();
        const request5 = await requestList.fetchNextRequest();

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
        expect(await requestList.isEmpty()).to.be.eql(false);
        expect(await requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Mark 1st, 2nd handled
        // Reclaim 3rd 4th
        //

        await requestList.markRequestHandled(request1);
        await requestList.markRequestHandled(request2);
        await requestList.reclaimRequest(request3);
        await requestList.reclaimRequest(request4);

        expect(requestList.getState()).to.be.eql({
            inProgress: {
                'https://example.com/3': true,
                'https://example.com/4': true,
                'https://example.com/5': true,
            },
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(await requestList.isEmpty()).to.be.eql(false);
        expect(await requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Mark 5th handled
        //

        await requestList.markRequestHandled(request5);

        expect(requestList.getState()).to.be.eql({
            inProgress: {
                'https://example.com/3': true,
                'https://example.com/4': true,
            },
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(await requestList.isEmpty()).to.be.eql(false);
        expect(await requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Fetch 3rd and 4th
        // Mark 4th handled
        //

        const reclaimed3 = await requestList.fetchNextRequest();
        expect(reclaimed3.url).to.be.eql('https://example.com/3');
        const reclaimed4 = await requestList.fetchNextRequest();
        expect(reclaimed4.url).to.be.eql('https://example.com/4');
        await requestList.markRequestHandled(request4);

        expect(requestList.getState()).to.be.eql({
            inProgress: {
                'https://example.com/3': true,
            },
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(await requestList.isEmpty()).to.be.eql(false);
        expect(await requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Mark 3rd handled
        //

        await requestList.markRequestHandled(request3);

        expect(requestList.getState()).to.be.eql({
            inProgress: {},
            nextIndex: 5,
            nextUniqueKey: 'https://example.com/6',
        });
        expect(await requestList.isEmpty()).to.be.eql(false);
        expect(await requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Fetch 6th
        //

        const request6 = await requestList.fetchNextRequest();

        expect(request6.url).to.be.eql('https://example.com/6');
        expect(await requestList.fetchNextRequest()).to.be.eql(null);
        expect(requestList.getState()).to.be.eql({
            inProgress: {
                'https://example.com/6': true,
            },
            nextIndex: 6,
            nextUniqueKey: null,
        });
        expect(await requestList.isEmpty()).to.be.eql(true);
        expect(await requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Reclaim 6th
        //

        await requestList.reclaimRequest(request6);

        expect(requestList.getState()).to.be.eql({
            inProgress: {
                'https://example.com/6': true,
            },
            nextIndex: 6,
            nextUniqueKey: null,
        });
        expect(await requestList.isEmpty()).to.be.eql(false);
        expect(await requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Fetch 6th
        //

        const reclaimed6 = await requestList.fetchNextRequest();

        expect(reclaimed6.url).to.be.eql('https://example.com/6');
        expect(requestList.getState()).to.be.eql({
            inProgress: {
                'https://example.com/6': true,
            },
            nextIndex: 6,
            nextUniqueKey: null,
        });
        expect(await requestList.isEmpty()).to.be.eql(true);
        expect(await requestList.isFinished()).to.be.eql(false);
        expect(requestList.inProgress).to.include(requestList.reclaimed);

        //
        // Mark 6th handled
        //

        await requestList.markRequestHandled(reclaimed6);

        expect(requestList.getState()).to.be.eql({
            inProgress: {},
            nextIndex: 6,
            nextUniqueKey: null,
        });
        expect(await requestList.isEmpty()).to.be.eql(true);
        expect(await requestList.isFinished()).to.be.eql(true);
        expect(requestList.inProgress).to.include(requestList.reclaimed);
    });

    it('should correctly persists its state when persistStateKey is set', async () => {
        const PERSIST_STATE_KEY = 'some-key';
        const mock = sinon.mock(keyValueStore);

        mock.expects('getValue')
            .once()
            .withArgs(PERSIST_STATE_KEY)
            .returns(null);

        const opts = {
            sources: [
                { url: 'https://example.com/1' },
                { url: 'https://example.com/2' },
                { url: 'https://example.com/3' },
            ],
            persistStateKey: PERSIST_STATE_KEY,
        };

        const requestList = new Apify.RequestList(opts);
        await requestList.initialize();
        expect(requestList.isStatePersisted).to.be.eql(true);

        // Fetch one request and check that state is not persisted.
        const request1 = await requestList.fetchNextRequest();
        expect(requestList.isStatePersisted).to.be.eql(false);

        // Persist state.
        mock.expects('setValue')
            .once()
            .withArgs(PERSIST_STATE_KEY, requestList.getState())
            .returns(Promise.resolve());
        Apify.events.emit(ACTOR_EVENT_NAMES.PERSIST_STATE);
        await delayPromise(1);
        expect(requestList.isStatePersisted).to.be.eql(true);

        // Do some other changes and persist it again.
        const request2 = await requestList.fetchNextRequest();
        expect(requestList.isStatePersisted).to.be.eql(false);
        await requestList.markRequestHandled(request2);
        expect(requestList.isStatePersisted).to.be.eql(false);
        mock.expects('setValue')
            .once()
            .withArgs(PERSIST_STATE_KEY, requestList.getState())
            .returns(Promise.resolve());
        Apify.events.emit(ACTOR_EVENT_NAMES.PERSIST_STATE);
        await delayPromise(1);
        expect(requestList.isStatePersisted).to.be.eql(true);

        // Reclaim event doesn't change the state.
        await requestList.reclaimRequest(request1);
        expect(requestList.isStatePersisted).to.be.eql(true);

        // Now initiate new request list from saved state and check that it's same as state
        // of original request list.
        mock.expects('getValue')
            .once()
            .withArgs(PERSIST_STATE_KEY)
            .returns(Promise.resolve(requestList.getState()));
        const requestList2 = new Apify.RequestList(opts);
        await requestList2.initialize();
        expect(requestList2.getState()).to.be.eql(requestList.getState());

        mock.verify();
        mock.restore();
    });

    it('handles correctly inconsistent inProgress fields in state', async () => {
        // NOTE: This is a test for the deleteFromInProgress hotfix - see RequestList.initialize()

        const sources = [
            { url: 'https://www.ams360.com' },
            { url: 'https://www.anybus.com' },
            { url: 'https://www.anychart.com' },
            { url: 'https://www.example.com' },
        ];

        const state = {
            nextIndex: 2,
            nextUniqueKey: 'https://www.anychart.com',
            inProgress: {
                'https://www.ams360.com': true,
                'https://www.anybus.com': true,
                'https://www.anychart.com': true,
            },
        };

        const requestList = new Apify.RequestList({
            sources,
            state,
        });

        await requestList.initialize();

        // Get requests from list
        let reqs = [];
        for (let i = 0; i < 5; i++) {
            const request = await requestList.fetchNextRequest(); // eslint-disable-line
            if (!request) break;
            reqs.push(request);
        }

        reqs = _.shuffle(reqs);

        for (let i = 0; i < reqs.length; i++) {
            await requestList.reclaimRequest(reqs[i]); // eslint-disable-line
        }
    });
});
