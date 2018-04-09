import 'babel-polyfill';
import WebSocket from 'ws';
import sinon from 'sinon';
import Promise from 'bluebird';
import { expect } from 'chai';
import { delayPromise } from 'apify-shared/utilities';
import { ENV_VARS, ACTOR_EVENT_NAMES } from '../build/constants';
import Apify from '../build';

describe('Apify.events', () => {
    it('is there and works as EventEmitter', () => {
        return new Promise((resolve, reject) => {
            try {
                Apify.events.on('foo', resolve);
                Apify.events.emit('foo', 'test event');
            } catch (e) {
                reject(e);
            }
        })
            .then((arg) => {
                expect(arg).to.eql('test event');
            });
    });

    it('should work in Apify.main()', (done) => {
        const wss = new WebSocket.Server({ port: 9099 });
        const eventsReceived = [];
        let isWsConnected = false;

        // Create server that sends events
        wss.on('connection', (ws, req) => {
            isWsConnected = true;

            ws.on('close', () => {
                isWsConnected = false;
            });

            expect(req.url).to.be.eql('/someRunId');

            const send = obj => ws.send(JSON.stringify(obj));

            setTimeout(() => send({ name: 'name-1', data: [1, 2, 3] }), 50);
            setTimeout(() => send({ name: 'name-1', data: { foo: 'bar' } }), 100);
            setTimeout(() => send({ name: 'name-2', data: [1] }), 50);
            setTimeout(() => send({ name: 'name-2', data: [2] }), 50);
        });

        process.env[ENV_VARS.ACTOR_EVENTS_WS_URL] = 'ws://localhost:9099/someRunId';

        // Run main and store received events
        expect(isWsConnected).to.be.eql(false);
        Apify.main(async () => {
            await delayPromise(10); // Here must be short sleep to get following line to later tick
            expect(isWsConnected).to.be.eql(true);
            Apify.events.on('name-1', data => eventsReceived.push(data));
            await delayPromise(1000);
        });

        // Main will call process.exit() so we must stub it.
        const stubbedExit = sinon
            .stub(process, 'exit')
            .callsFake(async (code) => {
                expect(code).to.be.eql(0);
                expect(eventsReceived).to.be.eql([[1, 2, 3], { foo: 'bar' }]);

                // Cleanup.
                stubbedExit.restore();
                wss.close();
                delete process.env[ENV_VARS.ACTOR_EVENTS_WS_URL];
                await delayPromise(10); // Here must be short sleep to get following line to later tick
                expect(isWsConnected).to.be.eql(false);
                done();
            });
    });

    it('should work without Apify.main()', async () => {
        const wss = new WebSocket.Server({ port: 9099 });
        const eventsReceived = [];
        let isWsConnected = false;

        wss.on('connection', (ws, req) => {
            isWsConnected = true;

            ws.on('close', () => {
                isWsConnected = false;
            });

            expect(req.url).to.be.eql('/someRunId');

            const send = obj => ws.send(JSON.stringify(obj));

            setTimeout(() => send({ name: 'name-1', data: [1, 2, 3] }), 50);
            setTimeout(() => send({ name: 'name-1', data: { foo: 'bar' } }), 100);
            setTimeout(() => send({ name: 'name-2', data: [1] }), 50);
            setTimeout(() => send({ name: 'name-2', data: [2] }), 50);
        });

        process.env[ENV_VARS.ACTOR_EVENTS_WS_URL] = 'ws://localhost:9099/someRunId';

        // Connect to websocket and receive events.
        expect(isWsConnected).to.be.eql(false);
        await Apify.initializeEvents();
        await delayPromise(10); // Here must be short sleep to get following line to later tick
        expect(isWsConnected).to.be.eql(true);
        Apify.events.on('name-1', data => eventsReceived.push(data));
        await delayPromise(1000);

        expect(eventsReceived).to.be.eql([[1, 2, 3], { foo: 'bar' }]);

        expect(isWsConnected).to.be.eql(true);
        Apify.stopEvents();
        await delayPromise(10); // Here must be short sleep to get following line to later tick
        expect(isWsConnected).to.be.eql(false);

        // Cleanup.
        wss.close();
        delete process.env[ENV_VARS.ACTOR_EVENTS_WS_URL];
    });

    it('should send persist state events in regular interval', async () => {
        process.env.APIFY_TEST_PERSIST_INTERVAL_MILLIS = 20;

        const eventsReceived = [];
        Apify.events.on(ACTOR_EVENT_NAMES.PERSIST_STATE, data => eventsReceived.push(data));
        await Apify.initializeEvents();
        await delayPromise(115);
        await Apify.stopEvents();
        expect(eventsReceived.length).to.be.eql(5);
        await delayPromise(50);
        expect(eventsReceived.length).to.be.eql(5);

        delete process.env.APIFY_TEST_PERSIST_INTERVAL_MILLIS;
    });
});
